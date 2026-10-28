import { Core } from "@blaze-cardano/sdk";
import type { Cip30WalletApi } from "../dingo/cip30";
import { getBlaze } from "../dingo/blaze";
import {
  assertDingoNetwork,
  getDingoProvider,
} from "../dingo/utxorpc/provider";
import { blockfrostFetch } from "../dingo/blockfrost";
import {
  surveyDefinition,
  fromHex,
  encodeAnswers,
  type Meta,
  type Question,
  type Survey,
  type Answer,
} from "./cip179";
import { loadSurvey, loadSurveyResults } from "./data";
export type SurveyAction =
  | {
      kind: "create";
      title: string;
      description: string;
      endEpoch: number;
      questions: Question[];
    }
  | {
      kind: "respond";
      survey: Survey;
      answers: Record<number, Answer | undefined>;
    }
  | { kind: "cancel"; survey: Survey };
async function walletIdentity(
  api: Cip30WalletApi,
  assertConnection: () => void,
) {
  assertConnection();
  const [network, hex] = await Promise.all([
    api.getNetworkId(),
    api.getChangeAddress(),
    assertDingoNetwork(getDingoProvider()),
  ]);
  assertConnection();
  const address = Core.Address.fromBytes(Core.HexBlob(hex));
  const key = address.getProps().paymentPart;
  if (
    network !== 0 ||
    address.getNetworkId() !== 0 ||
    key?.type !== Core.Cardano.CredentialType.KeyHash
  )
    throw new Error("Connect a Preview wallet with a payment signing key.");
  return { address: address.toBech32(), key: key.hash.toString() };
}
async function validateAction(action: SurveyAction, key: string) {
  const [tip, genesis] = await Promise.all([
    blockfrostFetch<{ epoch: number; slot: number; epoch_slot: number }>(
      "/api/v0/blocks/latest",
    ),
    blockfrostFetch<{ epoch_length: number; network_magic: number }>(
      "/api/v0/genesis",
    ),
  ]);
  if (genesis.network_magic !== 2)
    throw new Error("Dingo’s explorer API is not on Preview.");
  if (
    !Number.isSafeInteger(tip.epoch) ||
    !Number.isSafeInteger(tip.slot) ||
    !Number.isSafeInteger(tip.epoch_slot) ||
    !Number.isSafeInteger(genesis.epoch_length) ||
    tip.epoch_slot < 0 ||
    tip.epoch_slot >= genesis.epoch_length
  )
    throw new Error("Dingo returned invalid chain timing.");
  const validUntil = Math.min(
    tip.slot + 600,
    tip.slot + genesis.epoch_length - tip.epoch_slot,
  );
  if (action.kind === "create") {
    if (!Number.isSafeInteger(action.endEpoch) || action.endEpoch <= tip.epoch)
      throw new Error("Choose an end epoch after the current epoch.");
  } else {
    const current = (await loadSurvey(action.survey.hash, action.survey.index))
      .survey;
    if (
      current.owner !== action.survey.owner ||
      current.endEpoch !== action.survey.endEpoch
    )
      throw new Error("Survey changed. Reload it.");
    if (tip.epoch > current.endEpoch) throw new Error("This survey is closed.");
    const results = await loadSurveyResults(current);
    if (results.cancelled) throw new Error("This survey was cancelled.");
    if (action.kind === "cancel" && current.owner !== key)
      throw new Error("Only the survey creator can cancel it.");
  }
  return { ...tip, validUntil };
}
export async function prepareSurveyTransaction(
  api: Cip30WalletApi,
  action: SurveyAction,
  assertConnection: () => void,
) {
  const identity = await walletIdentity(api, assertConnection);
  const tip = await validateAction(action, identity.key);
  let payload: Meta;
  if (action.kind === "create")
    payload = surveyDefinition(
      identity.key,
      action.title,
      action.description,
      action.endEpoch,
      action.questions,
    );
  else {
    const reference: Meta = [
      fromHex(action.survey.hash),
      BigInt(action.survey.index),
    ];
    payload =
      action.kind === "cancel"
        ? [2n, [reference]]
        : [
            1n,
            [
              new Map<Meta, Meta>([
                [0n, 5n],
                [1n, reference],
                [2n, 4n],
                [3n, [0n, fromHex(identity.key)]],
                [4n, encodeAnswers(action.survey.questions, action.answers)],
              ]),
            ],
          ];
  }
  const { blaze } = await getBlaze(api);
  assertConnection();
  const validUntil = tip.validUntil;
  const tx = await blaze
    .newTransaction()
    .setMetadata(Core.Metadata.fromCore(new Map([[17n, payload]])))
    .addRequiredSigner(Core.Ed25519KeyHashHex(identity.key))
    .setValidUntil(Core.Slot(validUntil))
    .complete();
  assertConnection();
  return { tx, blaze, identity, action, validUntil };
}
export type PreparedSurvey = Awaited<
  ReturnType<typeof prepareSurveyTransaction>
>;
export async function submitSurveyTransaction(
  api: Cip30WalletApi,
  prepared: PreparedSurvey,
  assertConnection: () => void,
) {
  const identity = await walletIdentity(api, assertConnection);
  if (
    identity.key !== prepared.identity.key ||
    identity.address !== prepared.identity.address
  )
    throw new Error("Wallet account changed. Review a new transaction.");
  const tip = await validateAction(prepared.action, identity.key);
  if (tip.slot >= prepared.validUntil)
    throw new Error("This transaction draft expired.");
  assertConnection();
  const signed = await prepared.blaze.signTransaction(prepared.tx);
  assertConnection();
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
      "Wallet did not sign with the required payment key. Nothing was submitted.",
    );
  return (await prepared.blaze.submitTransaction(signed, true)).toString();
}
