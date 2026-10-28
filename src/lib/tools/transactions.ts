import { Core } from "@blaze-cardano/sdk";
import type { Cip30WalletApi } from "../dingo/cip30";
import { getBlaze } from "../dingo/blaze";
import { blockfrostFetch } from "../dingo/blockfrost";
import {
  assertDingoNetwork,
  getDingoProvider,
} from "../dingo/utxorpc/provider";
import { parseAdaToLovelace, parseAssetAmount } from "../dingo/amount";
import { drepIdForPublicKey } from "../dingo/wallet";
import { readWalletDRep } from "../dingo/governanceVote";
import { formatAda } from "../format";

export type Payment = { address: string; amount: string; asset: string };
export type ToolAction =
  | { kind: "batch"; payments: Payment[] }
  | { kind: "consolidate"; inputs: string[] }
  | { kind: "split"; count: string; amount: string }
  | { kind: "proof"; name: string; digest: string; message: string }
  | {
      kind: "mint";
      name: string;
      quantity: string;
      minutes: string;
      description: string;
    }
  | { kind: "burn"; asset: string; quantity: string; policy: string }
  | { kind: "drep"; operation: "register" | "renew" }
  | { kind: "donate"; amount: string };

export function inputId(u: Core.TransactionUnspentOutput) {
  return `${u.input().transactionId()}#${u.input().index()}`;
}
export function assetName(id: string) {
  if (id === "lovelace") return "ADA";
  try {
    return (
      Core.AssetName.toUTF8(
        Core.AssetId.getAssetName(Core.AssetId(id)),
        true,
      ) || id
    );
  } catch {
    return id;
  }
}
export function plainWalletOutputs(utxos: Core.TransactionUnspentOutput[]) {
  return utxos.filter(
    (u) =>
      u.output().address().getProps().paymentPart?.type ===
        Core.Cardano.CredentialType.KeyHash &&
      !u.output().datum() &&
      !u.output().scriptRef(),
  );
}
export async function walletOutputs(api: Cip30WalletApi) {
  const raw = await api.getUtxos();
  const utxos = (raw ?? []).map((cbor) =>
    Core.TransactionUnspentOutput.fromCbor(Core.HexBlob(cbor)),
  );
  if (new Set(utxos.map(inputId)).size !== utxos.length)
    throw new Error("Wallet returned duplicate UTxOs.");
  if (utxos.some((u) => u.output().address().getNetworkId() !== 0))
    throw new Error("Wallet returned outputs from another network.");
  return utxos;
}
function positive(raw: string, label: string) {
  const value = parseAssetAmount(raw, 0, label);
  if (value <= 0n || value > 9223372036854775807n)
    throw new Error(
      `Enter a positive ${label} within the signed 64-bit range.`,
    );
  return value;
}
export function textChunks(text: string) {
  const chunks: string[] = [];
  let chunk = "";
  for (const char of text) {
    if (new TextEncoder().encode(chunk + char).length > 64) {
      chunks.push(chunk);
      chunk = "";
    }
    chunk += char;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}
async function identity(api: Cip30WalletApi, assertConnection: () => void) {
  assertConnection();
  const [network, raw] = await Promise.all([
    api.getNetworkId(),
    api.getChangeAddress(),
    assertDingoNetwork(getDingoProvider()),
  ]);
  assertConnection();
  const address = Core.Address.fromBytes(Core.HexBlob(raw));
  const key = address.getProps().paymentPart;
  if (
    network !== 0 ||
    address.getNetworkId() !== 0 ||
    key?.type !== Core.Cardano.CredentialType.KeyHash
  )
    throw new Error("Connect a Preview wallet with a payment signing key.");
  return { address, key: Core.Ed25519KeyHashHex(key.hash) };
}
async function timing() {
  const [tip, genesis] = await Promise.all([
    blockfrostFetch<{ slot: number }>("/api/v0/blocks/latest"),
    blockfrostFetch<{ network_magic: number }>("/api/v0/genesis"),
  ]);
  if (
    genesis.network_magic !== 2 ||
    !Number.isSafeInteger(tip.slot) ||
    tip.slot < 0
  )
    throw new Error("Dingo did not return valid Preview timing.");
  return tip.slot;
}
function policyExpiry(
  script: Core.Cardano.NativeScript,
  allowedKeys: Set<string>,
  policyKeys: Set<string>,
): number | undefined {
  if (script.kind === Core.Cardano.NativeScriptKind.RequireSignature) {
    if (!allowedKeys.has(script.keyHash))
      throw new Error(
        "This policy requires a signing key outside the connected wallet.",
      );
    policyKeys.add(script.keyHash);
    return;
  }
  if (script.kind === Core.Cardano.NativeScriptKind.RequireTimeBefore)
    return script.slot;
  if (script.kind === Core.Cardano.NativeScriptKind.RequireAllOf) {
    if (
      !script.scripts.length ||
      !script.scripts.some(
        (s) => s.kind === Core.Cardano.NativeScriptKind.RequireSignature,
      )
    )
      throw new Error("Policy must require this wallet’s signature.");
    const deadlines = script.scripts
      .map((s) => policyExpiry(s, allowedKeys, policyKeys))
      .filter((s): s is number => s !== undefined);
    return deadlines.length ? Math.min(...deadlines) : undefined;
  }
  throw new Error(
    "Import a signature or signature-and-expiry policy created by this tool.",
  );
}
export async function prepareToolTransaction(
  api: Cip30WalletApi,
  action: ToolAction,
  assertConnection: () => void,
) {
  const who = await identity(api, assertConnection);
  const slot = await timing();
  const { blaze } = await getBlaze(api);
  assertConnection();
  let validUntil = slot + 600;
  const builder = blaze.newTransaction().addRequiredSigner(who.key);
  const facts: { label: string; value: string }[] = [];
  let policyCbor: string | undefined;
  let policyId: string | undefined;
  let drepKey: string | undefined;
  const ownedOutputs = await walletOutputs(api);
  const policySigningKeys = new Set<string>();
  let selected: Core.TransactionUnspentOutput[] | undefined;
  const exactPayments: {
    address: string;
    coin?: bigint;
    unit?: string;
    quantity?: bigint;
  }[] = [];
  if (action.kind === "batch") {
    if (!action.payments.length || action.payments.length > 40)
      throw new Error("Add between 1 and 40 recipients.");
    for (const payment of action.payments) {
      let address: Core.Address;
      try {
        address = Core.Address.fromBech32(payment.address.trim());
      } catch {
        throw new Error("Each recipient needs a valid payment address.");
      }
      if (address.getNetworkId() !== 0 || !address.getProps().paymentPart)
        throw new Error("Recipients must be testnet payment addresses.");
      if (payment.asset === "lovelace") {
        const amount = parseAdaToLovelace(payment.amount);
        if (amount <= 0n) throw new Error("Each payment must be positive.");
        builder.payLovelace(address, amount);
        exactPayments.push({ address: address.toBech32(), coin: amount });
      } else {
        if (!/^[a-f0-9]{56}([a-f0-9]{2}){0,32}$/i.test(payment.asset))
          throw new Error("Select a valid native asset.");
        const quantity = positive(payment.amount, "raw token quantity");
        builder.payAssets(
          address,
          new Core.Value(
            0n,
            new Map([[Core.AssetId(payment.asset), quantity]]),
          ),
        );
        exactPayments.push({
          address: address.toBech32(),
          unit: payment.asset,
          quantity,
        });
      }
    }
    facts.push({ label: "Recipients", value: String(action.payments.length) });
  } else if (action.kind === "consolidate") {
    const utxos = plainWalletOutputs(ownedOutputs);
    const ids = new Set(action.inputs);
    if (ids.size < 2 || ids.size > 100)
      throw new Error("Select between 2 and 100 wallet UTxOs.");
    selected = utxos.filter((u) => ids.has(inputId(u)));
    if (selected.length !== ids.size)
      throw new Error(
        "A selected UTxO is no longer available. Refresh the list.",
      );
    selected.forEach((u) => builder.addInput(u));
    facts.push(
      { label: "Selected inputs", value: String(selected.length) },
      { label: "Destination", value: who.address.toBech32() },
      {
        label: "Tokens",
        value: "All assets retained; network fee deducted from ADA.",
      },
    );
  } else if (action.kind === "split") {
    const count = Number(action.count);
    const amount = parseAdaToLovelace(action.amount);
    if (!Number.isInteger(count) || count < 2 || count > 40 || amount <= 0n)
      throw new Error("Choose 2–40 positive ADA outputs.");
    for (let i = 0; i < count; i++) {
      builder.payLovelace(who.address, amount);
      exactPayments.push({ address: who.address.toBech32(), coin: amount });
    }
    facts.push(
      { label: "New outputs", value: `${count} × ${formatAda(amount)}` },
      { label: "Destination", value: who.address.toBech32() },
    );
  } else if (action.kind === "proof") {
    if (!/^[a-f0-9]{64}$/.test(action.digest))
      throw new Error("Choose a file to hash first.");
    if (
      !action.name.trim() ||
      new TextEncoder().encode(action.name).length > 256 ||
      new TextEncoder().encode(action.message).length > 512
    )
      throw new Error(
        "Use a file name up to 256 bytes and a message up to 512 bytes.",
      );
    const proof = new Map<Core.Cardano.Metadatum, Core.Cardano.Metadatum>([
      ["algorithm", "SHA-256"],
      ["hash", action.digest],
      ["name", textChunks(action.name)],
    ]);
    const payload = new Map<Core.Cardano.Metadatum, Core.Cardano.Metadatum>([
      ["msg", textChunks(action.message || "Document proof")],
      ["proof", proof],
    ]);
    builder.setMetadata(Core.Metadata.fromCore(new Map([[674n, payload]])));
    facts.push(
      { label: "File", value: action.name },
      { label: "SHA-256", value: action.digest },
      { label: "Public message", value: action.message || "Document proof" },
      {
        label: "Publication",
        value:
          "File name, hash and message only. The file stays on this device.",
      },
    );
  } else if (action.kind === "mint" || action.kind === "burn") {
    const quantity = positive(action.quantity, "token quantity");
    let native: Core.NativeScript;
    let name: Core.AssetName;
    if (action.kind === "mint") {
      const minutes = Number(action.minutes);
      if (!Number.isInteger(minutes) || minutes < 15 || minutes > 525600)
        throw new Error(
          "Choose a policy duration between 15 minutes and one year.",
        );
      const encoded = new TextEncoder().encode(action.name);
      if (!encoded.length || encoded.length > 32)
        throw new Error("Asset names must contain 1–32 UTF-8 bytes.");
      const deadline = slot + minutes * 60;
      native = Core.NativeScript.newScriptAll(
        new Core.ScriptAll([
          Core.NativeScript.newScriptPubkey(new Core.ScriptPubkey(who.key)),
          Core.NativeScript.newTimelockExpiry(
            new Core.TimelockExpiry(Core.Slot(deadline)),
          ),
        ]),
      );
      name = Core.AssetName(Core.HexBlob.fromBytes(encoded));
      if (new TextEncoder().encode(action.description).length > 512)
        throw new Error("Description is limited to 512 UTF-8 bytes.");
    } else {
      if (action.policy.length > 32768)
        throw new Error("Native policy CBOR exceeds 16 KiB.");
      try {
        native = Core.NativeScript.fromCbor(Core.HexBlob(action.policy.trim()));
      } catch {
        throw new Error("Paste the native policy CBOR saved when minting.");
      }
      if (!/^[a-f0-9]{56}([a-f0-9]{2}){0,32}$/i.test(action.asset))
        throw new Error("Select an asset to burn.");
      name = Core.AssetName(action.asset.slice(56));
      const held = ownedOutputs.reduce(
        (n, u) =>
          n +
          (u.output().amount().multiasset()?.get(Core.AssetId(action.asset)) ??
            0n),
        0n,
      );
      if (quantity > held)
        throw new Error(
          "The connected wallet does not hold enough of this asset.",
        );
    }
    const allowedPolicyKeys = new Set<string>([who.key]);
    if (action.kind === "burn") {
      for (const raw of await api.getUsedAddresses()) {
        const address = Core.Address.fromBytes(Core.HexBlob(raw));
        const payment = address.getProps().paymentPart;
        if (
          address.getNetworkId() === 0 &&
          payment?.type === Core.Cardano.CredentialType.KeyHash
        )
          allowedPolicyKeys.add(payment.hash);
      }
    }
    const deadline = policyExpiry(
      native.toCore(),
      allowedPolicyKeys,
      policySigningKeys,
    );
    if (!policySigningKeys.size)
      throw new Error("Policy must require a wallet payment signature.");
    if (deadline !== undefined) {
      if (deadline <= slot)
        throw new Error(
          "This policy has expired; minting and burning are no longer possible.",
        );
      validUntil = Math.min(validUntil, deadline);
      facts.push({ label: "Policy expires at slot", value: String(deadline) });
    }
    const script = Core.Script.newNativeScript(native);
    const hash = native.hash();
    if (typeof hash !== "string" || !/^[a-f0-9]{56}$/.test(hash))
      throw new Error("Unable to hash the native policy.");
    policyId = hash;
    policyCbor = native.toCbor();
    if (action.kind === "burn" && policyId !== action.asset.slice(0, 56))
      throw new Error("The policy does not match the selected asset.");
    builder
      .provideScript(script)
      .addMint(
        Core.PolicyId(policyId),
        new Map([[name, action.kind === "burn" ? -quantity : quantity]]),
      );
    if (action.kind === "mint") {
      const initials = [...action.name]
        .slice(0, 2)
        .join("")
        .replace(
          /[&<>"']/g,
          (c) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&apos;",
            })[c]!,
        );
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="56" fill="#0c1b26"/><circle cx="128" cy="128" r="94" fill="#174d40" stroke="#53d4b4" stroke-width="4"/><text x="128" y="149" text-anchor="middle" font-family="sans-serif" font-size="64" font-weight="bold" fill="#96f6d7">${initials}</text></svg>`;
      const image = `data:image/svg+xml;base64,${btoa(String.fromCharCode(...new TextEncoder().encode(svg)))}`;
      const metadata = new Map<Core.Cardano.Metadatum, Core.Cardano.Metadatum>([
        ["name", action.name],
        ["image", textChunks(image)],
        ["mediaType", "image/svg+xml"],
        ["description", textChunks(action.description)],
      ]);
      builder.setMetadata(
        Core.Metadata.fromCore(
          new Map([
            [
              721n,
              new Map<Core.Cardano.Metadatum, Core.Cardano.Metadatum>([
                [policyId, new Map([[action.name, metadata]])],
                ["version", "1.0"],
              ]),
            ],
          ]),
        ),
      );
    }
    facts.push(
      {
        label: "Operation",
        value: action.kind === "mint" ? "Mint" : "Burn permanently",
      },
      { label: "Quantity (raw units)", value: quantity.toString() },
      { label: "Policy ID", value: policyId },
      { label: "Asset ID", value: policyId + name },
    );
  } else if (action.kind === "donate") {
    const amount = parseAdaToLovelace(action.amount);
    if (amount <= 0n) throw new Error("Enter a positive donation.");
    builder.setDonation(amount);
    facts.push(
      { label: "Preview treasury donation", value: formatAda(amount) },
      {
        label: "Destination",
        value: "Cardano Preview treasury; no recipient or contract.",
      },
    );
  } else {
    if (!api.cip95)
      throw new Error("Connect a wallet exposing CIP-95 DRep signing.");
    const pub = await api.cip95.getPubDRepKey();
    const id = drepIdForPublicKey(pub);
    const credential = Core.Cardano.DRepID.toCredential(
      Core.Cardano.DRepID(id),
    );
    drepKey = credential.hash;
    const role = await readWalletDRep(api);
    const registered = role && !role.retired;
    if (action.operation === "register") {
      if (registered)
        throw new Error("This DRep is already registered. Use renew activity.");
      const params = await blockfrostFetch<{ drep_deposit: string }>(
        "/api/v0/epochs/latest/parameters",
      );
      const deposit = parseAssetAmount(params.drep_deposit, 0, "DRep deposit");
      if (deposit > 9223372036854775807n)
        throw new Error("Dingo returned an invalid DRep deposit.");
      builder.addRegisterDRep(Core.Credential.fromCore(credential), deposit);
      facts.push({ label: "Registration deposit", value: formatAda(deposit) });
    } else {
      if (!registered)
        throw new Error("Register this DRep before renewing its activity.");
      builder.addUpdateDRep(Core.Credential.fromCore(credential));
      facts.push({
        label: "Renew activity",
        value: "Refresh DRep activity and clear any existing metadata anchor.",
      });
    }
    facts.push({ label: "DRep ID", value: id });
  }
  assertConnection();
  builder.setValidUntil(Core.Slot(validUntil));
  const tx = await builder.complete(
    selected ? { useCoinSelection: false } : undefined,
  );
  assertConnection();
  for (let i = 0; i < exactPayments.length; i++) {
    const intended = exactPayments[i],
      actual = tx.body().outputs()[i];
    if (
      !actual ||
      actual.address().toBech32() !== intended.address ||
      (intended.coin !== undefined &&
        actual.amount().coin() !== intended.coin) ||
      (intended.unit &&
        actual.amount().multiasset()?.get(Core.AssetId(intended.unit)) !==
          intended.quantity)
    )
      throw new Error(
        `Output ${i + 1} differs from the draft, often because its ADA is below the minimum output value. Increase its amount.`,
      );
  }
  if (selected) {
    const ids = new Set(selected.map(inputId));
    if (
      tx
        .body()
        .inputs()
        .values()
        .some((i) => !ids.has(`${i.transactionId()}#${i.index()}`)) ||
      tx
        .body()
        .outputs()
        .some((o) => o.address().toBech32() !== who.address.toBech32())
    )
      throw new Error(
        "Consolidation changed its selected inputs or destination.",
      );
  }
  const inputSigningKeys = new Set<string>([who.key, ...policySigningKeys]);
  const ownedById = new Map(ownedOutputs.map((u) => [inputId(u), u]));
  for (const input of tx.body().inputs().values()) {
    const source = ownedById.get(`${input.transactionId()}#${input.index()}`);
    const payment = source?.output().address().getProps().paymentPart;
    if (!source || payment?.type !== Core.Cardano.CredentialType.KeyHash)
      throw new Error(
        "The transaction includes an input not controlled by this wallet’s payment keys.",
      );
    inputSigningKeys.add(payment.hash);
  }
  return {
    tx,
    blaze,
    action,
    identity: who,
    validUntil,
    facts,
    inputSigningKeys: [...inputSigningKeys],
    policyCbor,
    policyId,
    drepKey,
  };
}
export type PreparedTool = Awaited<ReturnType<typeof prepareToolTransaction>>;
export async function submitToolTransaction(
  api: Cip30WalletApi,
  draft: PreparedTool,
  assertConnection: () => void,
) {
  const who = await identity(api, assertConnection);
  if (
    who.address.toBech32() !== draft.identity.address.toBech32() ||
    who.key !== draft.identity.key
  )
    throw new Error("Wallet account changed. Build a new draft.");
  if ((await timing()) >= draft.validUntil)
    throw new Error("This transaction draft has expired. Review a new draft.");
  if (draft.drepKey) {
    if (
      !api.cip95 ||
      Core.Cardano.DRepID.toCredential(
        Core.Cardano.DRepID(
          drepIdForPublicKey(await api.cip95.getPubDRepKey()),
        ),
      ).hash !== draft.drepKey
    )
      throw new Error("Wallet DRep key changed. Build a new draft.");
    const role = await readWalletDRep(api);
    if (
      draft.action.kind === "drep" &&
      ((draft.action.operation === "register" && role && !role.retired) ||
        (draft.action.operation === "renew" && (!role || role.retired)))
    )
      throw new Error("DRep registration changed. Build a new draft.");
  }
  assertConnection();
  const signed = await draft.blaze.signTransaction(draft.tx);
  assertConnection();
  if (signed.getId() !== draft.tx.getId())
    throw new Error("Wallet changed the transaction body.");
  const keys = [
    ...draft.inputSigningKeys,
    ...(draft.drepKey ? [draft.drepKey] : []),
  ];
  for (const hash of keys) {
    const witness = signed
      .witnessSet()
      .vkeys()
      ?.toCore()
      .find(
        ([key]) => Core.Ed25519PublicKey.fromHex(key).hash().hex() === hash,
      );
    if (
      !witness ||
      !Core.Ed25519PublicKey.fromHex(witness[0]).verify(
        Core.Ed25519Signature.fromHex(witness[1]),
        Core.HexBlob(signed.getId()),
      )
    )
      throw new Error(
        "Wallet did not provide a valid required signature. Nothing was submitted.",
      );
  }
  return (await draft.blaze.submitTransaction(signed, true)).toString();
}
