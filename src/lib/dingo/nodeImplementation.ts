import { registeredProducer } from "./nodeRegistry";
import type { DecodedProducerPayload } from "./producerPayload";

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

interface NodeIdentity {
  id: string;
  name: string;
  icon: string;
  detail: string;
  signal: ProducerSignal;
  payloadSummary?: string;
  decodedPayload?: DecodedProducerPayload;
  registration?: string;
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
  const registered = registeredProducer(0, id, payload);
  if (registered) {
    const decoded = registered.decodedPayload;
    const payloadSummary = decoded.kind === "decoded"
      ? decoded.fields.map(field => `${field.name}: ${field.label === undefined ? String(field.value) : `${field.label} (${field.value})`}`).join(" · ")
      : undefined;
    return {
      id: registered.id,
      name: registered.name,
      icon: registered.icon,
      signal,
      registration: registered.status,
      decodedPayload: decoded,
      payloadSummary,
      detail: `CIP-203 · scheme 0 · ID ${id} · ${decoded.kind === "decoded" ? "payload" : "opaque payload"} ${payload} · ${registered.status} registry entry${decoded.kind === "unknown-layout" ? ` · unknown payload layout ${decoded.layoutVersion}` : payloadSummary ? ` · ${payloadSummary}` : ""}`,
    };
  }
  if (id === 69)
    return {
      id: "dingo",
      name: "Dingo",
      icon: "/nodes/dingo.png",
      detail: `${detail} · historical producer signal`,
      registration: "historical",
      signal,
    };
  if (id === 42)
    return {
      id: "gerolamo",
      icon: "/nodes/unknown.svg",
      name: "Gerolamo",
      detail: `${detail} · historical producer signal`,
      registration: "historical",
      signal,
    };
  if (id === 67)
    return {
      id: "cardano-bean",
      name: "cardano-bean",
      icon: "/nodes/bean.svg",
      detail: `${detail} · historical producer signal`,
      registration: "historical",
      signal,
    };
  return {
    ...unknown,
    name: `Unregistered implementation ${id}`,
    detail,
    signal,
  };
}
