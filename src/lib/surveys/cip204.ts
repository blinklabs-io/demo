import { DINGO_NETWORK } from "../dingo/config";
import { assertWalletSession } from "../dingo/walletSession";
import { Core } from "@blaze-cardano/sdk";
import { blockfrostFetch, BlockfrostError } from "../dingo/blockfrost";
import { getBlaze } from "../dingo/blaze";
import type { Cip30WalletApi } from "../dingo/cip30";
import {
  assertDingoNetwork,
  getDingoProvider,
} from "../dingo/utxorpc/provider";
import type { VotingProposal, VoteChoice } from "../dingo/governanceVote";
import { fromHex, type Meta } from "./cip179";

export const holderChoices = { no: 0n, yes: 1n, abstain: 2n };
export function holderRecord(
  key: string,
  proposal: VotingProposal,
  choice: VoteChoice,
): Meta {
  if (
    !/^[a-f0-9]{56}$/i.test(key) ||
    !/^[a-f0-9]{64}$/i.test(proposal.tx_hash) ||
    !Number.isSafeInteger(proposal.cert_index) ||
    proposal.cert_index < 0 ||
    proposal.cert_index > 65535 ||
    !Object.hasOwn(holderChoices, choice)
  )
    throw new Error("Invalid holder answer.");
  return new Map<Meta, Meta>([
    [0n, 1n],
    [1n, [0n, fromHex(key)]],
    [
      2n,
      [
        [
          [fromHex(proposal.tx_hash), BigInt(proposal.cert_index)],
          holderChoices[choice],
        ],
      ],
    ],
  ]);
}
export function holderClosingEpoch(proposal: VotingProposal): number {
  if (
    !Number.isSafeInteger(proposal.expiration) ||
    proposal.expiration < 0 ||
    !Number.isSafeInteger(proposal.expiration + 1)
  )
    throw new Error("Invalid governance deadline.");
  const endings = [
    proposal.enacted_epoch,
    proposal.dropped_epoch,
    proposal.expired_epoch,
  ];
  if (
    endings.some(
      (epoch) => epoch !== null && (!Number.isSafeInteger(epoch) || epoch < 0),
    )
  )
    throw new Error("Invalid governance closing epoch.");
  return Math.min(
    proposal.expiration + 1,
    ...endings.filter((epoch): epoch is number => epoch !== null),
  );
}
interface Inclusion {
  hash: string;
  block: string;
  block_height: number;
  index: number;
  slot: number;
  valid_contract: boolean;
}
interface Block {
  hash: string;
  height: number;
  epoch: number;
  slot: number;
}
async function inclusion(hash: string, signal?: AbortSignal) {
  const tx = await blockfrostFetch<Inclusion>(`/api/v0/txs/${hash}`, {
    signal,
  });
  const block = await blockfrostFetch<Block>(`/api/v0/blocks/${tx.block}`, {
    signal,
  });
  if (
    tx.hash !== hash ||
    block.hash !== tx.block ||
    tx.valid_contract !== true ||
    tx.block_height !== block.height ||
    tx.slot !== block.slot ||
    !Number.isSafeInteger(block.slot) ||
    block.slot < 0 ||
    !Number.isSafeInteger(block.height) ||
    block.height < 0 ||
    !Number.isSafeInteger(block.epoch) ||
    block.epoch < 0 ||
    !Number.isSafeInteger(tx.index) ||
    tx.index < 0
  )
    throw new Error("Invalid transaction inclusion returned by Dingo.");
  return { ...tx, height: block.height, epoch: block.epoch };
}
interface Registration {
  tx_hash: string;
  action: string;
}
export async function holderEligibility(
  stakeAddress: string,
  proposal: VotingProposal,
  signal?: AbortSignal,
  atHeight?: number,
) {
  const submitted = await inclusion(proposal.tx_hash, signal);
  const history: Registration[] = [];
  for (let page = 1; ; page++) {
    let rows: Registration[];
    try {
      rows = await blockfrostFetch<Registration[]>(
        `/api/v0/accounts/${stakeAddress}/registrations?count=100&page=${page}&order=asc`,
        { signal },
      );
    } catch (error) {
      if (
        error instanceof BlockfrostError &&
        error.status === 404 &&
        page === 1 &&
        error.body !== null &&
        typeof error.body === "object" &&
        "message" in error.body &&
        error.body.message === "The requested component has not been found."
      )
        return false;
      throw error;
    }
    history.push(...rows);
    if (rows.length < 100) break;
  }
  // Registration and action in one transaction do not satisfy "registered before".
  let registered = false;
  let uninterrupted = true;
  let eligibleAtSubmission = false;
  let crossed = false;
  const closing = holderClosingEpoch(proposal);
  for (const row of history) {
    const at = await inclusion(row.tx_hash, signal);
    if (atHeight !== undefined && at.height > atHeight) continue;
    const before =
      at.height < submitted.height ||
      (at.height === submitted.height && at.index < submitted.index);
    if (!before && !crossed) {
      eligibleAtSubmission = registered;
      crossed = true;
    }
    if (at.epoch >= closing) continue;
    if (row.action !== "registered" && row.action !== "deregistered")
      throw new Error("Unknown stake registration event.");
    if (row.action === "deregistered" && !before) uninterrupted = false;
    registered = row.action === "registered";
  }
  if (!crossed) eligibleAtSubmission = registered;
  return eligibleAtSubmission && uninterrupted;
}
async function walletIdentities(
  api: Cip30WalletApi,
  assertConnection: () => void,
) {
  assertConnection();
  const [network, addresses] = await Promise.all([
    api.getNetworkId(),
    api.getRewardAddresses(),
    assertDingoNetwork(getDingoProvider()),
  ]);
  assertConnection();
  if (network !== 0 || !addresses.length)
    throw new Error(`Connect a ${DINGO_NETWORK.label} wallet with a stake key.`);
  const identities = addresses.flatMap((hex) => {
    const address = Core.Address.fromBytes(Core.HexBlob(hex));
    const credential = address.asReward()?.getPaymentCredential();
    return address.getNetworkId() === 0 &&
      credential?.type === Core.Cardano.CredentialType.KeyHash
      ? [{ stakeAddress: address.toBech32(), key: credential.hash.toString() }]
      : [];
  });
  if (!identities.length)
    throw new Error(`CIP-204 requires a ${DINGO_NETWORK.label} stake signing key.`);
  return identities;
}

async function validate(proposal: VotingProposal) {
  const [current, tip, genesis] = await Promise.all([
    blockfrostFetch<VotingProposal>(
      `/api/v0/governance/proposals/${encodeURIComponent(proposal.id)}`,
    ),
    blockfrostFetch<{ epoch: number; slot: number; epoch_slot: number }>(
      "/api/v0/blocks/latest",
    ),
    blockfrostFetch<{ network_magic: number; epoch_length: number }>(
      "/api/v0/genesis",
    ),
  ]);
  if (
    current.tx_hash !== proposal.tx_hash ||
    current.cert_index !== proposal.cert_index
  )
    throw new Error("Governance action changed. Reload this page.");
  if (
    genesis.network_magic !== DINGO_NETWORK.networkMagic ||
    !Number.isSafeInteger(genesis.epoch_length) ||
    genesis.epoch_length <= 0 ||
    !Number.isSafeInteger(tip.epoch) ||
    !Number.isSafeInteger(tip.slot) ||
    tip.slot < 0 ||
    !Number.isSafeInteger(tip.epoch_slot) ||
    tip.epoch_slot < 0 ||
    tip.epoch_slot >= genesis.epoch_length
  )
    throw new Error(`Dingo did not return valid ${DINGO_NETWORK.label} timing.`);
  if (tip.epoch >= holderClosingEpoch(current))
    throw new Error("Holder answers have closed for this action.");
  return {
    current,
    tip,
    validUntil: Math.min(
      tip.slot + 600,
      tip.slot + genesis.epoch_length - tip.epoch_slot,
    ),
  };
}
export async function prepareHolderAnswer(
  api: Cip30WalletApi,
  proposal: VotingProposal,
  choice: VoteChoice,
  assertConnection: () => void,
) {
  const identities = await walletIdentities(api, assertConnection);
  const { current, validUntil } = await validate(proposal);
  let identity: (typeof identities)[number] | undefined;
  for (const candidate of identities) {
    if (await holderEligibility(candidate.stakeAddress, current)) {
      identity = candidate;
      break;
    }
  }
  if (!identity)
    throw new Error(
      "Your stake key must have been registered before this action, without a later deregistration.",
    );
  const record = holderRecord(identity.key, current, choice);
  const { blaze } = await getBlaze(api);
  assertConnection();
  const tx = await blaze
    .newTransaction()
    .setMetadata(Core.Metadata.fromCore(new Map([[1695n, record]])))
    .addRequiredSigner(Core.Ed25519KeyHashHex(identity.key))
    .setValidUntil(Core.Slot(validUntil))
    .complete();
  assertConnection();
  return { tx, blaze, identity, proposal: current, choice, validUntil };
}
export type PreparedHolderAnswer = Awaited<
  ReturnType<typeof prepareHolderAnswer>
>;
export async function submitHolderAnswer(
  api: Cip30WalletApi,
  prepared: PreparedHolderAnswer,
  assertConnection: () => void,
) {
  const identities = await walletIdentities(api, assertConnection);
  const identity = identities.find(
    (candidate) =>
      candidate.key === prepared.identity.key &&
      candidate.stakeAddress === prepared.identity.stakeAddress,
  );
  if (!identity)
    throw new Error("Wallet account changed. Review a new answer.");
  const { tip, current } = await validate(prepared.proposal);
  if (!(await holderEligibility(identity.stakeAddress, current)))
    throw new Error(
      "Your stake registration no longer qualifies for this answer.",
    );
  if (tip.slot >= prepared.validUntil)
    throw new Error("This answer draft expired.");
  await assertWalletSession(api, assertConnection);
  const signed = await prepared.blaze.signTransaction(prepared.tx);
  await assertWalletSession(api, assertConnection);
  if (signed.getId() !== prepared.tx.getId())
    throw new Error(
      "Wallet changed the transaction body. Nothing was submitted.",
    );
  const witness = signed
    .witnessSet()
    .vkeys()
    ?.toCore()
    .find(
      ([key]) =>
        Core.Ed25519PublicKey.fromHex(key).hash().hex() === identity.key,
    );
  if (
    !witness ||
    !Core.Ed25519PublicKey.fromHex(witness[0]).verify(
      Core.Ed25519Signature.fromHex(witness[1]),
      Core.HexBlob(signed.getId()),
    )
  )
    throw new Error(
      "Wallet did not sign with your stake key. Nothing was submitted.",
    );
  return (await prepared.blaze.submitTransaction(signed, true)).toString();
}

function bytesHex(value: Meta | undefined, size: number): string {
  if (!(value instanceof Uint8Array) || value.length !== size)
    throw new Error("Invalid CIP-204 byte string.");
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
export function decodeHolderRecord(
  value: Meta | undefined,
  signers: readonly string[],
) {
  if (!(value instanceof Map)) throw new Error("Invalid CIP-204 record.");
  let previous = -1n;
  for (const key of value.keys()) {
    if (typeof key !== "bigint" || key < 0n || key <= previous)
      throw new Error("CIP-204 keys must be ascending unsigned integers.");
    previous = key;
  }
  if (value.get(0n) !== 1n) throw new Error("Unsupported CIP-204 version.");
  const credential = value.get(1n);
  if (
    !Array.isArray(credential) ||
    credential.length !== 2 ||
    credential[0] !== 0n
  )
    throw new Error("Invalid CIP-204 stake credential.");
  const key = bytesHex(credential[1], 28);
  if (!signers.includes(key)) throw new Error("Missing required stake signer.");
  const raw = value.get(2n);
  if (!Array.isArray(raw) || !raw.length)
    throw new Error("CIP-204 requires at least one answer.");
  const answers = raw.map((item, index) => {
    if (
      !Array.isArray(item) ||
      item.length !== 2 ||
      !Array.isArray(item[0]) ||
      item[0].length !== 2
    )
      throw new Error("Invalid CIP-204 answer.");
    const hash = bytesHex(item[0][0], 32);
    const n = item[0][1];
    const choice = item[1];
    if (
      typeof n !== "bigint" ||
      n < 0n ||
      n > 65535n ||
      (choice !== 0n && choice !== 1n && choice !== 2n)
    )
      throw new Error("Invalid CIP-204 action or choice.");
    return { hash, actionIndex: Number(n), choice: Number(choice), index };
  });
  return { key, answers };
}
async function readHolderRecord(hash: string, signal?: AbortSignal) {
  if (!/^[a-f0-9]{64}$/.test(hash))
    throw new Error("Invalid holder transaction hash.");
  const [raw, at] = await Promise.all([
    blockfrostFetch<{ cbor: string }>(`/api/v0/txs/${hash}/cbor`, { signal }),
    inclusion(hash, signal),
  ]);
  const tx = Core.Transaction.fromCbor(Core.HexBlob(raw.cbor));
  const auxiliary = tx.auxiliaryData();
  const metadata = auxiliary?.metadata();
  if (
    tx.getId() !== hash ||
    !tx.isValid() ||
    !auxiliary ||
    !metadata ||
    Core.blake2b_256(auxiliary.toCbor()) !== tx.body().auxiliaryDataHash()
  )
    throw new Error("Invalid holder answer transaction proof.");
  const labels = new Core.CborReader(metadata.toCbor());
  labels.readStartMap();
  let count = 0;
  while (labels.peekState() !== Core.CborReaderState.EndMap) {
    if (labels.readInt() === 1695n) count++;
    labels.readEncodedValue();
  }
  labels.readEndMap();
  if (count !== 1) throw new Error("Duplicate or missing CIP-204 label.");
  const datum = metadata.metadata()?.get(1695n);
  if (!datum) throw new Error("Missing CIP-204 record.");
  const reader = new Core.CborReader(datum.toCbor());
  reader.readStartMap();
  let previous = -1n;
  while (reader.peekState() !== Core.CborReaderState.EndMap) {
    const key = reader.readInt();
    if (key < 0n || key <= previous)
      throw new Error("Duplicate or unordered CIP-204 record keys.");
    previous = key;
    reader.readEncodedValue();
  }
  reader.readEndMap();
  return {
    ...at,
    ...decodeHolderRecord(
      metadata.toCore().get(1695n),
      tx.body().requiredSigners()?.toCore() ?? [],
    ),
  };
}
export interface HolderResult {
  hash: string;
  key: string;
  choice: number;
  height: number;
  txIndex: number;
  answerIndex: number;
  counted: boolean;
  reason: string;
}
export async function loadHolderResults(
  proposal: VotingProposal,
  signal?: AbortSignal,
) {
  const [current, submitted, tip] = await Promise.all([
    blockfrostFetch<VotingProposal>(
      `/api/v0/governance/proposals/${encodeURIComponent(proposal.id)}`,
      { signal },
    ),
    inclusion(proposal.tx_hash, signal),
    blockfrostFetch<{ height: number; hash: string }>("/api/v0/blocks/latest", {
      signal,
    }),
  ]);
  if (
    !Number.isSafeInteger(tip.height) ||
    tip.height < 0 ||
    !/^[a-f0-9]{64}$/.test(tip.hash)
  )
    throw new Error("Invalid recount snapshot returned by Dingo.");
  if (
    current.tx_hash !== proposal.tx_hash ||
    current.cert_index !== proposal.cert_index
  )
    throw new Error("Governance action changed.");
  const closing = holderClosingEpoch(current);
  const rows: { tx_hash: string; json_metadata: unknown }[] = [];
  for (let page = 1; ; page++) {
    const batch = await blockfrostFetch<
      { tx_hash: string; json_metadata: unknown }[]
    >(`/api/v0/metadata/txs/labels/1695?count=100&page=${page}&order=asc`, {
      signal,
    });
    rows.push(...batch);
    if (batch.length < 100) break;
  }
  const eligibility = new Map<string, Promise<boolean>>();
  const entries: HolderResult[] = [];
  let invalid = 0;
  const candidates = new Set(
    rows
      .filter((row) => {
        if (!row.json_metadata || typeof row.json_metadata !== "object")
          return false;
        const answers = (row.json_metadata as Record<string, unknown>)["2"];
        return (
          Array.isArray(answers) &&
          answers.some((answer) => {
            const reference = Array.isArray(answer) ? answer[0] : undefined;
            return (
              Array.isArray(reference) &&
              typeof reference[0] === "string" &&
              reference[0].toLowerCase() === proposal.tx_hash &&
              Number(reference[1]) === proposal.cert_index
            );
          })
        );
      })
      .map((row) => row.tx_hash),
  );
  for (const hash of candidates) {
    let record;
    try {
      record = await readHolderRecord(hash, signal);
    } catch (error) {
      signal?.throwIfAborted();
      // Transport failures leave the tally incomplete; malformed records are excluded.
      if (error instanceof BlockfrostError) throw error;
      invalid++;
      continue;
    }
    for (const answer of record.answers) {
      if (
        answer.hash !== proposal.tx_hash ||
        answer.actionIndex !== proposal.cert_index
      )
        continue;
      let reason = "Counted";
      if (record.height > tip.height) reason = "After recount snapshot";
      else if (
        record.height < submitted.height ||
        (record.height === submitted.height && record.index <= submitted.index)
      )
        reason = "Before action submission";
      else if (record.epoch >= closing) reason = "After answers closed";
      else {
        let eligible = eligibility.get(record.key);
        if (!eligible) {
          const stake = Core.RewardAddress.fromCredentials(0, {
            type: Core.Cardano.CredentialType.KeyHash,
            hash: Core.Hash28ByteBase16(record.key),
          })
            .toAddress()
            .toBech32();
          eligible = holderEligibility(stake, current, signal, tip.height);
          eligibility.set(record.key, eligible);
        }
        if (!(await eligible))
          reason = "Registration did not meet CIP-204 eligibility";
      }
      entries.push({
        hash,
        key: record.key,
        choice: answer.choice,
        height: record.height,
        txIndex: record.index,
        answerIndex: answer.index,
        counted: reason === "Counted",
        reason,
      });
    }
  }
  entries.sort(
    (a, b) =>
      b.height - a.height ||
      b.txIndex - a.txIndex ||
      b.answerIndex - a.answerIndex,
  );
  const seen = new Set<string>();
  for (const entry of entries)
    if (entry.counted) {
      if (seen.has(entry.key)) {
        entry.counted = false;
        entry.reason = "Replaced by a newer answer";
      } else seen.add(entry.key);
    }
  const canonical = await blockfrostFetch<{ hash: string; height: number }>(
    `/api/v0/blocks/${tip.height}`,
    { signal },
  );
  if (canonical.hash !== tip.hash || canonical.height !== tip.height)
    throw new Error(
      "The chain rolled back during the recount. Recount answers again.",
    );
  return {
    entries,
    invalid,
    scanned: rows.length,
    snapshot: tip,
    candidates: candidates.size,
  };
}
