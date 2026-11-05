import { hexToBytes } from "../dingo/utxorpc/bytes";
import { Core } from "@blaze-cardano/sdk";
import {
  assertDingoNetwork,
  getDingoProvider,
  type DingoProvider,
} from "../dingo/utxorpc/provider";
import { decodeKernelDatum } from "./datum";
import { KERNEL_LANES, assertKernelNetwork, type KernelLane } from "./protocol";

export type KernelRecord = {
  lane: KernelLane;
  outpoint: string;
  address: string;
  lovelace: bigint;
  kind: string;
  fields: ReturnType<typeof decodeKernelDatum>["fields"];
  datumCbor: string;
  utxo: Core.TransactionUnspentOutput;
};
export async function kernelReferences(
  lane: KernelLane,
  provider: DingoProvider = getDingoProvider(),
) {
  return kernelReferencesForLanes([lane], provider);
}
export async function kernelReferencesForLanes(
  lanes: KernelLane[],
  provider: DingoProvider = getDingoProvider(),
) {
  assertKernelNetwork();
  if (!lanes.length || lanes.length > 7)
    throw new Error("Choose bounded Kernel reference lanes.");
  const expected = [
    ...new Map(
      lanes
        .flatMap((lane) => [...KERNEL_LANES[lane].references])
        .map((ref) => [`${ref.hash}#${ref.index}`, ref]),
    ).values(),
  ];

  const outputs = await provider.resolveUnspentOutputs(
    expected.map(
      (ref) =>
        new Core.TransactionInput(
          Core.TransactionId(ref.hash),
          BigInt(ref.index),
        ),
    ),
  );
  if (
    outputs.length !== expected.length ||
    expected.some(
      (ref) =>
        !outputs.some(
          (output) =>
            output.input().transactionId() === ref.hash &&
            output.input().index() === BigInt(ref.index) &&
            output.output().address().getNetworkId() === 0 &&
            output.output().scriptRef()?.hash() === ref.hashScript,
        ),
    )
  )
    throw new Error(
      "Dingo could not verify the deployed Kernel reference scripts.",
    );
  return outputs;
}
export function kernelRecord(
  lane: KernelLane,
  utxo: Core.TransactionUnspentOutput,
): KernelRecord {
  const protocol = KERNEL_LANES[lane],
    output = utxo.output(),
    address = output.address();
  if (
    address.getNetworkId() !== 0 ||
    address.getProps().paymentPart?.type !== Core.CredentialType.ScriptHash ||
    address.getProps().paymentPart?.hash !== protocol.validatorHash
  )
    throw new Error("Output is not at the canonical Kernel validator.");
  const datum = output.datum()?.asInlineData();
  if (!datum) throw new Error("Kernel output has no inline datum.");
  const decoded = decodeKernelDatum(protocol.family, datum.toCbor());
  const assets = output.amount().multiasset();
  if (
    !assets ||
    ![...assets].some(
      ([unit, quantity]) =>
        unit.startsWith(protocol.beaconPolicy) && quantity > 0n,
    )
  )
    throw new Error("Kernel beacon is missing.");
  const policies = Object.entries(decoded.fields).filter(([key]) =>
    [
      "beacon_id",
      "beacon_policy_id",
      "negotiation_beacon_id",
      "active_beacon_id",
      "proposal_beacon_policy_id",
      "active_beacon_policy_id",
    ].includes(key),
  );
  if (!policies.some(([, value]) => value === protocol.beaconPolicy))
    throw new Error("Kernel datum does not match its beacon policy.");
  return {
    lane,
    outpoint: `${utxo.input().transactionId()}#${utxo.input().index()}`,
    address: address.toBech32(),
    lovelace: output.amount().coin(),
    kind: decoded.kind,
    fields: decoded.fields,
    datumCbor: datum.toCbor(),
    utxo,
  };
}
export async function loadKernelPage(
  lane: KernelLane,
  startToken = "",
  signal?: AbortSignal,
  provider: DingoProvider = getDingoProvider(),
) {
  assertKernelNetwork();
  signal?.throwIfAborted();
  if (startToken.length > 16384) throw new Error("Invalid Kernel page token.");
  await assertDingoNetwork(provider);
  signal?.throwIfAborted();
  await kernelReferences(lane, provider);
  signal?.throwIfAborted();
  const response = await provider.queryClient.inner.searchUtxos(
    {
      maxItems: 24,
      startToken,
      predicate: {
        match: {
          utxoPattern: {
            case: "cardano",
            value: {
              asset: { policyId: hexToBytes(KERNEL_LANES[lane].beaconPolicy) },
            },
          },
        },
      },
    },
    { signal },
  );
  if (response.items.length > 24)
    throw new Error("Dingo exceeded the requested Kernel page size.");
  const records: KernelRecord[] = [],
    rejected: { outpoint: string; reason: string }[] = [],
    seen = new Set<string>();
  for (const item of response.items) {
    signal?.throwIfAborted();
    const ref = item.txoRef;
    if (!ref || ref.hash.length !== 32)
      throw new Error("Dingo returned an invalid Kernel output reference.");
    const outpoint = `${Core.toHex(ref.hash)}#${ref.index}`;
    if (seen.has(outpoint)) throw new Error("Dingo repeated a Kernel output.");
    seen.add(outpoint);
    try {
      if (!item.nativeBytes.length || item.nativeBytes.length > 65536)
        throw new Error("Unsupported output CBOR size.");
      const output = Core.TransactionOutput.fromCbor(
        Core.HexBlob.fromBytes(item.nativeBytes),
      );
      records.push(
        kernelRecord(
          lane,
          new Core.TransactionUnspentOutput(
            new Core.TransactionInput(
              Core.TransactionId(Core.toHex(ref.hash)),
              BigInt(ref.index),
            ),
            output,
          ),
        ),
      );
    } catch (error) {
      rejected.push({
        outpoint,
        reason:
          error instanceof Error ? error.message : "Unsupported Kernel output",
      });
    }
  }
  return {
    records,
    rejected,
    nextToken: response.nextToken,
    snapshot: response.ledgerTip
      ? {
          hash: Core.toHex(response.ledgerTip.hash),
          height: response.ledgerTip.height,
          slot: response.ledgerTip.slot,
        }
      : null,
  };
}

export async function loadKernelRequest(
  outpoint: string,
  signal?: AbortSignal,
  provider: DingoProvider = getDingoProvider(),
) {
  const match = /^([a-f0-9]{64})#(0|[1-9]\d{0,9})$/.exec(outpoint);
  if (!match || Number(match[2]) > 4294967295)
    throw new Error(
      "Enter a request transaction hash followed by #output index.",
    );
  assertKernelNetwork();
  signal?.throwIfAborted();
  await assertDingoNetwork(provider);
  signal?.throwIfAborted();
  const input = new Core.TransactionInput(
    Core.TransactionId(match[1]),
    BigInt(match[2]),
  );
  const rows = await provider.resolveUnspentOutputs([input]);
  signal?.throwIfAborted();
  if (rows.length !== 1 || rows[0].input().toCbor() !== input.toCbor())
    throw new Error("This loan request is spent or unavailable.");
  const record = kernelRecord("loan-negotiation", rows[0]);
  if (record.kind !== "AskDatum")
    throw new Error("This output is not a loan request.");
  return record;
}
