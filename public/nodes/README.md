# Node icons

Original assets from [PRAGMA node diversity conformance](https://github.com/pragma-org/node-diversity-conformance/tree/main/nodes), licensed under Apache-2.0 (see LICENSE).

- dingo.png: nodes/dingo/logo.png
- bean.svg: nodes/cardano-bean/logo.svg
- cardano-node.svg: nodes/cardano-node/logo.svg
- amaru.svg: nodes/amaru/logo.svg
- unknown.svg: generic node icon created for this application

Block displays decode the [CIP-0203 producer signal](https://github.com/cardano-foundation/CIPs/tree/8bf55a9b05841799000f454b619ee5acd4b41854/CIP-0203): scheme bits 31–30, payload bits 29–8 and implementation ID bits 7–0. Schemes other than zero are not decoded. The pinned registry identifies Amaru as ID 65 and TSUNAGI as ID 79. Historical Dingo signals use ID 69. ID 67 is shared by Gerolamo and cardano-bean and is displayed as ambiguous using the generic icon.

Payload fields are decoded only from supported registry-linked definitions. The bundled Amaru definition does not conform to the supported definition contract, so its payload remains opaque without an inferred release date. Unspecified, nonconforming and unsupported payload formats remain opaque.

Unsignalled minor 0 is displayed as assumed Haskell cardano-node. Reserved release minors 1–15 with zero payload identify legacy Haskell nodes. Explicit opt-out ID 255, unregistered identifiers and unsupported schemes remain unidentified. All signals are producer declarations, not independent software attestations.
