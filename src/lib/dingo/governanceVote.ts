import { Core } from "@blaze-cardano/sdk";
import { blockfrostFetch, BlockfrostError } from "./blockfrost";
import { getBlaze } from "./blaze";
import type { Cip30WalletApi } from "./cip30";
import { drepIdForPublicKey } from "./wallet";
import { assertDingoNetwork, getDingoProvider } from "./utxorpc/provider";

export interface WalletDRep {
  drep_id: string;
  active: boolean;
  retired: boolean;
  expired: boolean;
}
export interface VotingProposal {
  id: string;
  tx_hash: string;
  cert_index: number;
  expiration: number;
  ratified_epoch: number | null;
  enacted_epoch: number | null;
  dropped_epoch: number | null;
  expired_epoch: number | null;
}
export type VoteChoice = "yes" | "no" | "abstain";

export async function readWalletDRep(
  api: Cip30WalletApi,
  signal?: AbortSignal,
) {
  if (!api.cip95) throw new Error("Connect a wallet with DRep voting support.");
  try {
    const id = drepIdForPublicKey(await api.cip95.getPubDRepKey());
    const role = await blockfrostFetch<WalletDRep>(
      `/api/v0/governance/dreps/${id}`,
      { signal },
    );
    const expected = Core.Cardano.DRepID.toCredential(Core.Cardano.DRepID(id));
    const actual = Core.Cardano.DRepID.toCredential(
      Core.Cardano.DRepID(role.drep_id),
    );
    if (actual.type !== expected.type || actual.hash !== expected.hash)
      throw new Error("Dingo returned a different DRep credential.");
    return role;
  } catch (error) {
    if (error instanceof BlockfrostError && error.status === 404) return null;
    throw governanceError(
      error,
      "Unable to read your wallet’s DRep credential.",
    );
  }
}

export function votingClosed(proposal: VotingProposal, epoch: number): boolean {
  return (
    proposal.ratified_epoch !== null ||
    proposal.enacted_epoch !== null ||
    proposal.dropped_epoch !== null ||
    proposal.expired_epoch !== null ||
    epoch > proposal.expiration
  );
}

async function validateVote(
  api: Cip30WalletApi,
  proposal: VotingProposal,
  assertConnection: () => void,
  expectedDRep?: string,
) {
  assertConnection();
  if ((await api.getNetworkId()) !== Core.NetworkId.Testnet)
    throw new Error("Switch your wallet to Preview and reconnect.");
  const [current, role, tip] = await Promise.all([
    blockfrostFetch<VotingProposal>(
      `/api/v0/governance/proposals/${encodeURIComponent(proposal.id)}`,
    ),
    readWalletDRep(api),
    blockfrostFetch<{ epoch: number; slot: number }>("/api/v0/blocks/latest"),
    assertDingoNetwork(getDingoProvider()),
  ]);
  assertConnection();
  if (
    current.tx_hash !== proposal.tx_hash ||
    current.cert_index !== proposal.cert_index
  )
    throw new Error("The governance action changed. Reload this page.");
  if (!role || role.retired)
    throw new Error("This wallet is not a registered DRep on Preview.");
  const credential = Core.Cardano.DRepID.toCredential(
    Core.Cardano.DRepID(role.drep_id),
  );
  if (credential.type !== Core.Cardano.CredentialType.KeyHash)
    throw new Error("The wallet must expose a DRep signing key.");
  if (expectedDRep && credential.hash !== expectedDRep)
    throw new Error(
      "The wallet's DRep credential changed. Review your vote again.",
    );
  if (
    !Number.isSafeInteger(tip.epoch) ||
    !Number.isSafeInteger(tip.slot) ||
    !Number.isSafeInteger(current.expiration)
  )
    throw new Error("Dingo did not return valid governance timing.");
  if (votingClosed(current, tip.epoch))
    throw new Error("Voting is closed for this governance action.");
  return { role, credential, tip };
}

export async function prepareGovernanceVote(
  api: Cip30WalletApi,
  proposal: VotingProposal,
  choice: VoteChoice,
  assertConnection: () => void,
) {
  if (
    !/^[a-f0-9]{64}$/i.test(proposal.tx_hash) ||
    !Number.isSafeInteger(proposal.cert_index) ||
    proposal.cert_index < 0 ||
    proposal.cert_index > 65535
  )
    throw new Error("Dingo returned an invalid governance action reference.");
  const voteValues = {
    yes: Core.Vote.yes,
    no: Core.Vote.no,
    abstain: Core.Vote.abstain,
  };
  if (!Object.hasOwn(voteValues, choice))
    throw new Error("Choose Yes, No, or Abstain.");
  const { role, credential, tip } = await validateVote(
    api,
    proposal,
    assertConnection,
  );
  const votes = new Core.VotingProcedures();
  votes.insert(
    Core.Voter.newDrep(credential),
    new Core.GovernanceActionId(
      Core.TransactionId(proposal.tx_hash),
      BigInt(proposal.cert_index),
    ),
    new Core.VotingProcedure(voteValues[choice]),
  );
  const { blaze } = await getBlaze(api);
  assertConnection();
  const validUntil = tip.slot + 600;
  const tx = await blaze
    .newTransaction()
    .setVotingProcedures(votes)
    .addRequiredSigner(Core.Ed25519KeyHashHex(credential.hash))
    .setValidUntil(Core.Slot(validUntil))
    .complete();
  assertConnection();
  return {
    tx,
    blaze,
    choice,
    drepId: role.drep_id,
    drepHash: credential.hash,
    validUntil,
  };
}

export type PreparedVote = Awaited<ReturnType<typeof prepareGovernanceVote>>;

export async function submitGovernanceVote(
  api: Cip30WalletApi,
  proposal: VotingProposal,
  prepared: PreparedVote,
  assertConnection: () => void,
) {
  const { tip } = await validateVote(
    api,
    proposal,
    assertConnection,
    prepared.drepHash,
  );
  if (tip.slot >= prepared.validUntil)
    throw new Error(
      "This vote draft expired. Review a new draft before signing.",
    );
  const signed = await prepared.blaze.signTransaction(prepared.tx);
  assertConnection();
  const witness = signed
    .witnessSet()
    .vkeys()
    ?.toCore()
    .find(
      ([key]) =>
        Core.Ed25519PublicKey.fromHex(key).hash().hex() === prepared.drepHash,
    );
  // Partial signing can return payment witnesses without the governance witness.
  if (
    !witness ||
    !Core.Ed25519PublicKey.fromHex(witness[0]).verify(
      Core.Ed25519Signature.fromHex(witness[1]),
      Core.HexBlob(signed.getId()),
    )
  )
    throw new Error(
      "The wallet did not sign with your DRep key. No vote was submitted.",
    );
  assertConnection();
  const hash = await prepared.blaze.submitTransaction(signed, true);
  return hash.toString();
}

export function governanceError(error: unknown, message: string): Error {
  if (error instanceof Error) return error;
  if (
    error &&
    typeof error === "object" &&
    "info" in error &&
    typeof error.info === "string"
  )
    return new Error(error.info);
  return new Error(message);
}
