import registry from "./nodeRegistry.json";
import amaruDefinition from "./amaruPayloadDefinition.json";
import { decodeProducerPayload } from "./producerPayload";

export const NODE_REGISTRY_SOURCE = "https://github.com/cardano-foundation/CIPs/blob/8bf55a9b05841799000f454b619ee5acd4b41854/CIP-0203/registry.json";
export const NODE_PAYLOAD_DEFINITION_SOURCES: Readonly<Record<string, string>> = {
  "0:65": "https://github.com/pragma-org/amaru/blob/8fce2fbbf25e8445d4b5060598a02c8aff1df032/cip-203-payload-definition.json",
};
const definitions: Readonly<Record<string, unknown>> = { "0:65": amaruDefinition };
const presentation: Readonly<Record<number, { id: string; icon: string }>> = {
  65: { id: "amaru", icon: "/nodes/amaru.svg" },
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
