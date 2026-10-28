import { Core } from "@blaze-cardano/sdk";
import { queryClient } from "../queryClient";
import { blockfrostFetch, BlockfrostError } from "../dingo/blockfrost";
import {
  array,
  record,
  integer,
  credential,
  ref,
  decodeSurvey,
  validateAnswers,
  type Survey,
  type Answer,
} from "./cip179";
export interface MetadataRow {
  tx_hash: string;
  json_metadata: unknown;
}
export function metadataPage(page: number, signal?: AbortSignal) {
  return blockfrostFetch<MetadataRow[]>(
    `/api/v0/metadata/txs/labels/17?page=${page}&count=100&order=desc`,
    { signal },
  );
}
export async function readSurveyTransaction(
  hash: string,
  signal?: AbortSignal,
) {
  const [raw, summary] = await Promise.all([
    queryClient.fetchQuery({
      queryKey: ["dingo", "survey-cbor", hash],
      queryFn: ({ signal: cacheSignal }) =>
        blockfrostFetch<{ cbor: string }>(`/api/v0/txs/${hash}/cbor`, {
          signal: cacheSignal,
        }),
      staleTime: Infinity,
      retry: false,
    }),
    blockfrostFetch<{
      hash: string;
      block: string;
      slot: number;
      index: number;
      valid_contract: boolean;
    }>(`/api/v0/txs/${hash}`, { signal }),
  ]);
  const tx = Core.Transaction.fromCbor(Core.HexBlob(raw.cbor));
  if (
    tx.getId() !== hash ||
    summary.hash !== hash ||
    !summary.block ||
    !tx.isValid() ||
    summary.valid_contract !== true
  )
    throw new Error("Transaction is not a confirmed valid survey transaction.");
  const block = await queryClient.fetchQuery({
    queryKey: ["dingo", "survey-block", summary.block],
    queryFn: ({ signal: cacheSignal }) =>
      blockfrostFetch<{ hash: string; epoch: number; slot: number }>(
        `/api/v0/blocks/${summary.block}`,
        { signal: cacheSignal },
      ),
    staleTime: Infinity,
    retry: false,
  });
  if (
    block.hash !== summary.block ||
    !Number.isSafeInteger(block.epoch) ||
    !Number.isSafeInteger(summary.slot) ||
    !Number.isSafeInteger(summary.index)
  )
    throw new Error("Invalid survey inclusion data.");
  if (
    (tx.auxiliaryData()
      ? Core.blake2b_256(tx.auxiliaryData()!.toCbor())
      : undefined) !== tx.body().auxiliaryDataHash()
  )
    throw new Error(
      "Survey metadata does not match the transaction body hash.",
    );
  const metadata = tx.auxiliaryData()?.metadata();
  if (!metadata) throw new Error("Missing survey metadata.");
  const labels = new Core.CborReader(metadata.toCbor());
  labels.readStartMap();
  let surveyLabels = 0;
  while (labels.peekState() !== Core.CborReaderState.EndMap) {
    if (labels.readInt() === 17n) surveyLabels++;
    labels.readEncodedValue();
  }
  labels.readEndMap();
  if (surveyLabels !== 1)
    throw new Error(
      "A transaction must contain exactly one CIP-179 metadata label.",
    );
  const metadatum = tx.auxiliaryData()?.metadata()?.metadata()?.get(17n);
  if (!metadatum) throw new Error("Missing CIP-179 metadata.");
  const reader = new Core.CborReader(metadatum.toCbor());
  reader.readStartArray();
  const tag = reader.readInt();
  reader.readStartArray();
  while (reader.peekState() !== Core.CborReaderState.EndArray) {
    const item = new Core.CborReader(
      Core.HexBlob.fromBytes(reader.readEncodedValue()),
    );
    if (tag === 0n || tag === 1n) {
      item.readStartMap();
      let previous = -1n;
      while (item.peekState() !== Core.CborReaderState.EndMap) {
        const key = item.readInt();
        if (key < 0n || key <= previous)
          throw new Error(
            "CIP-179 record keys are duplicated or out of order.",
          );
        previous = key;
        item.readEncodedValue();
      }
      item.readEndMap();
    }
  }
  reader.readEndArray();
  reader.readEndArray();
  const payload = array(tx.auxiliaryData()?.metadata()?.toCore().get(17n));
  if (payload.length !== 2) throw new Error("Invalid CIP-179 payload.");
  return {
    hash,
    tx,
    payload,
    epoch: block.epoch,
    slot: summary.slot,
    index: summary.index,
    signers: tx.body().requiredSigners()?.toCore() ?? [],
  };
}
export type SurveyTransaction = Awaited<
  ReturnType<typeof readSurveyTransaction>
>;
export async function loadSurvey(
  hash: string,
  index: number,
  signal?: AbortSignal,
) {
  const publication = await readSurveyTransaction(hash, signal);
  if (integer(publication.payload[0]) !== 0)
    throw new Error("This transaction does not define a survey.");
  const definition = array(publication.payload[1])[index];
  if (!definition)
    throw new Error("Survey not found at this transaction index.");
  const survey = decodeSurvey(definition, hash, index);
  if (
    !publication.signers.includes(Core.Ed25519KeyHashHex(survey.owner)) ||
    survey.endEpoch <= publication.epoch
  )
    throw new Error("Survey owner proof or creation deadline is invalid.");
  return { survey, publication };
}
function targets(
  value: unknown,
  hash: string,
  index: number,
  kind: number,
): boolean {
  if (
    !Array.isArray(value) ||
    Number(value[0]) !== kind ||
    !Array.isArray(value[1])
  )
    return false;
  return value[1].some((item) => {
    const r =
      kind === 2
        ? item
        : item && typeof item === "object"
          ? (item as Record<string, unknown>)["1"]
          : null;
    return (
      Array.isArray(r) &&
      typeof r[0] === "string" &&
      r[0].toLowerCase() === hash &&
      Number(r[1]) === index
    );
  });
}
export interface CountedResponse {
  hash: string;
  credential: string;
  answers: Map<number, Answer>;
  slot: number;
  txIndex: number;
  responseIndex: number;
  counted: boolean;
  reason: string;
}
export async function loadSurveyResults(
  survey: Survey,
  signal?: AbortSignal,
  onProgress?: (count: number) => void,
) {
  const publication = await readSurveyTransaction(survey.hash, signal);
  const rows: MetadataRow[] = [];
  for (let page = 1; ; page++) {
    const batch = await metadataPage(page, signal);
    rows.push(...batch);
    onProgress?.(rows.length);
    if (batch.length < 100) break;
  }
  const candidates = [
    ...new Map(
      rows
        .filter(
          (row) =>
            targets(row.json_metadata, survey.hash, survey.index, 1) ||
            targets(row.json_metadata, survey.hash, survey.index, 2),
        )
        .map((row) => [row.tx_hash, row]),
    ).values(),
  ];
  const responses: CountedResponse[] = [];
  let cancelled = false;
  for (let offset = 0; offset < candidates.length; offset += 4) {
    await Promise.all(
      candidates.slice(offset, offset + 4).map(async (row) => {
        let context: SurveyTransaction;
        try {
          context = await readSurveyTransaction(row.tx_hash, signal);
        } catch (error) {
          if (
            error instanceof BlockfrostError ||
            (error instanceof DOMException && error.name === "AbortError")
          )
            throw error;
          responses.push({
            hash: row.tx_hash,
            credential: "",
            answers: new Map(),
            slot: 0,
            txIndex: 0,
            responseIndex: 0,
            counted: false,
            reason:
              error instanceof Error
                ? error.message
                : "Invalid survey transaction",
          });
          return;
        }
        const kind = integer(context.payload[0]);
        const items = array(context.payload[1]);
        for (
          let responseIndex = 0;
          responseIndex < items.length;
          responseIndex++
        ) {
          const item = items[responseIndex];
          let target;
          try {
            target = ref(kind === 2 ? item : record(item).get(1n));
          } catch {
            continue;
          }
          if (target.hash !== survey.hash || target.index !== survey.index)
            continue;
          const entry: CountedResponse = {
            hash: row.tx_hash,
            credential: "",
            answers: new Map(),
            slot: context.slot,
            txIndex: context.index,
            responseIndex,
            counted: false,
            reason: "",
          };
          try {
            if (row.tx_hash === survey.hash)
              throw new Error("Self-referencing response.");
            if (
              context.slot < publication.slot ||
              (context.slot === publication.slot &&
                context.index <= publication.index)
            )
              throw new Error("Submitted before the survey definition.");
            if (context.epoch > survey.endEpoch)
              throw new Error("Submitted after the deadline.");
            if (kind === 2) {
              if (
                context.signers.includes(Core.Ed25519KeyHashHex(survey.owner))
              )
                cancelled = true;
              continue;
            }
            if (kind !== 1) continue;
            const m = record(item);
            if (integer(m.get(0n)) !== 5 || integer(m.get(2n)) !== 4)
              throw new Error("Unsupported version or ineligible role.");
            entry.credential = credential(m.get(3n));
            if (
              !context.signers.includes(
                Core.Ed25519KeyHashHex(entry.credential),
              )
            )
              throw new Error("Missing required-signer credential proof.");
            entry.answers = validateAnswers(survey.questions, array(m.get(4n)));
            entry.counted = true;
            entry.reason = "Counted";
          } catch (error) {
            entry.reason =
              error instanceof Error ? error.message : "Invalid response";
          }
          responses.push(entry);
        }
      }),
    );
  }
  responses.sort(
    (a, b) =>
      b.slot - a.slot ||
      b.txIndex - a.txIndex ||
      b.responseIndex - a.responseIndex,
  );
  const seen = new Set<string>();
  for (const entry of responses) {
    if (cancelled) {
      entry.counted = false;
      entry.reason = "Survey cancelled";
    } else if (entry.counted) {
      if (seen.has(entry.credential)) {
        entry.counted = false;
        entry.reason = "Replaced by a newer valid response";
      } else seen.add(entry.credential);
    }
  }
  return { cancelled, responses, scanned: rows.length };
}
export function answerTotals(
  survey: Survey,
  responses: CountedResponse[],
  questionIndex: number,
) {
  const q = survey.questions[questionIndex];
  const counted = responses.filter((r) => r.counted);
  const values = counted.map((r) => r.answers.get(questionIndex));
  const present = values.filter((v) => v !== undefined);
  const counts = q.options.map((label, i) => ({
    label,
    value: present.reduce<bigint>((sum, v) => {
      if (q.tag === 1) return sum + (v === i ? 1n : 0n);
      if (q.tag === 2) return sum + ((v as number[]).includes(i) ? 1n : 0n);
      if (q.tag === 3) {
        const rank = (v as number[]).indexOf(i);
        return sum + BigInt(rank === -1 ? 0 : q.options.length - rank);
      }
      return (
        sum +
        BigInt((v as Array<[number, number]>).find((p) => p[0] === i)?.[1] ?? 0)
      );
    }, 0n),
  }));
  return {
    counts,
    abstain: values.length - present.length,
    answered: present.length,
    numeric: q.tag === 4 ? (present as number[]) : [],
  };
}
