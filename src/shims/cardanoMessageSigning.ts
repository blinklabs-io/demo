const message =
  "CIP-8 data signing is not bundled in this app; use the connected CIP-30 wallet for transaction signing.";

function unsupported(): never {
  throw new Error(message);
}

function unsupportedNamespace(name: string): unknown {
  const callableTarget = function unsupportedNamespaceTarget(): never {
    return unsupported();
  };
  return new Proxy(
    callableTarget,
    {
      get(_target, property) {
        if (property === "then") {
          return undefined;
        }
        throw new Error(`${message} Requested ${name}.${String(property)}.`);
      },
      apply: unsupported,
      construct: unsupported,
    },
  );
}

export const AlgorithmId = unsupportedNamespace("AlgorithmId");
export const BigNum = unsupportedNamespace("BigNum");
export const CBORValue = unsupportedNamespace("CBORValue");
export const COSEKey = unsupportedNamespace("COSEKey");
export const COSESign1Builder = unsupportedNamespace("COSESign1Builder");
export const HeaderMap = unsupportedNamespace("HeaderMap");
export const Headers = unsupportedNamespace("Headers");
export const Int = unsupportedNamespace("Int");
export const KeyType = unsupportedNamespace("KeyType");
export const Label = unsupportedNamespace("Label");
export const ProtectedHeaderMap = unsupportedNamespace("ProtectedHeaderMap");
