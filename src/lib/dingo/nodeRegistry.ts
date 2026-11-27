import registry from "./nodeRegistry.json";
import amaruDefinition from "./amaruPayloadDefinition.json";
import { decodeProducerPayload } from "./producerPayload";

export const NODE_REGISTRY_SOURCE = "https://github.com/cardano-foundation/CIPs/blob/c7d5a3897c75aef9e0cf6c37187da7d25ecc1248/CIP-0203/registry.json";
export const NODE_PAYLOAD_DEFINITION_SOURCES: Readonly<Record<string, string>> = {
  "0:65": "https://raw.githubusercontent.com/pragma-org/amaru/main/crates/amaru-kernel/src/cardano/software_tag/cip-0203-payload.json",
};
const definitions: Readonly<Record<string, unknown>> = { "0:65": amaruDefinition };
const presentation: Readonly<Record<number, { id: string; icon: string }>> = {
  65: { id: "amaru", icon: "/nodes/amaru.svg" },
  67: { id: "cardano-bean", icon: "/nodes/bean.svg" },
  73: { id: "scarab", icon: "/nodes/scarab.png" },
  79: { id: "tsunagi", icon: "/nodes/unknown.svg" },
};

export function registeredProducer(scheme: number, id: number, payload: number) {
  const entry = registry.find(entry => entry.scheme === scheme && entry.id === id);
  if (!entry) return undefined;
  const key = `${scheme}:${id}`;
  const source = entry.payload_definition && entry.payload_definition === NODE_PAYLOAD_DEFINITION_SOURCES[key]
    ? definitions[key] : undefined;
  return {
    ...entry,
    ...(presentation[id] ?? { id: `implementation-${id}`, icon: "/nodes/unknown.svg" }),
    decodedPayload: decodeProducerPayload(payload, source),
  };
}
