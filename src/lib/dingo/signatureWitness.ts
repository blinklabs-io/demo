import { Core } from "@blaze-cardano/sdk";

// A wallet may return only payment witnesses when asked for a partial
// signature, so the required key's witness has to be located and verified.
export function assertSignedWithKey(
  signed: Core.Transaction,
  keyHash: string,
  message: string,
) {
  const witness = signed
    .witnessSet()
    .vkeys()
    ?.toCore()
    .find(
      ([key]) => Core.Ed25519PublicKey.fromHex(key).hash().hex() === keyHash,
    );
  if (
    !witness ||
    !Core.Ed25519PublicKey.fromHex(witness[0]).verify(
      Core.Ed25519Signature.fromHex(witness[1]),
      Core.HexBlob(signed.getId()),
    )
  )
    throw new Error(message);
}
