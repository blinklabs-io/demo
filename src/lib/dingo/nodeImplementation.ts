export type ProducerSignal =
  | { kind: "invalid" }
  | { kind: "unsupported"; scheme: number }
  | { kind: "cip203"; scheme: 0; implementationId: number; payload: number };

export function decodeProducerSignal(minor: string): ProducerSignal {
  if (!/^\d{1,10}$/.test(minor)) return { kind: "invalid" };
  const value = BigInt(minor);
  if (value > 0xffffffffn) return { kind: "invalid" };
  const scheme = Number(value >> 30n);
  if (scheme !== 0) return { kind: "unsupported", scheme };
  return {
    kind: "cip203",
    scheme: 0,
    implementationId: Number(value & 255n),
    payload: Number((value >> 8n) & 0x3fffffn),
  };
}

type AmaruPayload =
  | { kind: "unsupported"; layout: number }
  | { kind: "unreleased"; layout: 0 }
  | { kind: "release"; layout: 0; date: string };

function decodeAmaruPayload(payload: number): AmaruPayload {
  const layout = payload >>> 20;
  if (layout !== 0) return { kind: "unsupported", layout };
  const days = (payload >>> 6) & 0x3fff;
  if (!days) return { kind: "unreleased", layout: 0 };
  return {
    kind: "release",
    layout: 0,
    date: new Date(Date.UTC(2026, 0, 1) + days * 86400000)
      .toISOString()
      .slice(0, 10),
  };
}
interface NodeIdentity {
  id: string;
  name: string;
  icon: string;
  detail: string;
  signal: ProducerSignal;
  release?: string;
}

export function nodeImplementation(minor: string): NodeIdentity {
  const signal = decodeProducerSignal(minor);
  const unknown = { id: "unknown", icon: "/nodes/unknown.svg" };
  if (signal.kind === "invalid")
    return {
      ...unknown,
      name: "Invalid producer signal",
      detail: "Outside the CIP-203 unsigned 32-bit field",
      signal,
    };
  if (signal.kind === "unsupported")
    return {
      ...unknown,
      name: `Unsupported scheme ${signal.scheme}`,
      detail:
        "Identifier and payload are not interpreted for a reserved scheme",
      signal,
    };
  const { implementationId: id, payload } = signal;
  const detail = `CIP-203 · scheme 0 · ID ${id} · opaque payload ${payload}`;
  if (id === 255)
    return {
      ...unknown,
      name: "Identity withheld",
      detail: `${detail} · deliberate opt-out`,
      signal,
    };
  if (id === 0)
    return {
      id: "cardano-node",
      name: "Haskell cardano-node (assumed)",
      icon: "/nodes/cardano-node.svg",
      detail:
        "No implementation signal; Haskell attribution is a display assumption",
      signal,
    };
  if (id >= 1 && id <= 15 && payload === 0)
    return {
      id: "cardano-node",
      name: "Haskell cardano-node",
      icon: "/nodes/cardano-node.svg",
      detail: `Legacy cardano-node release minor ${id}`,
      signal,
    };
  if (id === 69)
    return {
      id: "dingo",
      name: "Dingo",
      icon: "/nodes/dingo.png",
      detail,
      signal,
    };
  if (id === 67)
    return {
      ...unknown,
      id: "gerolamo-bean",
      name: "Gerolamo / cardano-bean",
      detail: `${detail} · shared identifier; implementation cannot be distinguished`,
      signal,
    };
  if (id === 65) {
    const decoded = decodeAmaruPayload(payload);
    const release =
      decoded.kind === "release"
        ? `Release ${decoded.date}`
        : decoded.kind === "unreleased"
          ? "Unreleased build"
          : `Unknown payload layout ${decoded.layout}`;
    return {
      id: "amaru",
      name: "Amaru",
      icon: "/nodes/amaru.svg",
      signal,
      release,
      detail: `CIP-203 · scheme 0 · ID 65 · ${release}${decoded.kind !== "unsupported" ? " · layout 0; unassigned flags ignored" : "; payload not interpreted"}`,
    };
  }

  return {
    ...unknown,
    name: `Unregistered implementation ${id}`,
    detail,
    signal,
  };
}
