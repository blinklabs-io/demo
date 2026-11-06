# Node icons

Original assets from [PRAGMA node diversity conformance](https://github.com/pragma-org/node-diversity-conformance/tree/main/nodes), licensed under Apache-2.0 (see LICENSE).

- dingo.png: nodes/dingo/logo.png
- bean.svg: nodes/cardano-bean/logo.svg
- cardano-node.svg: nodes/cardano-node/logo.svg
- amaru.svg: nodes/amaru/logo.svg
- unknown.svg: generic node icon created for this application

Block displays decode the proposed [CIP-203 producer signal](https://github.com/cardano-foundation/CIPs/pull/1276): scheme bits 31–30, opaque payload bits 29–8 and implementation ID bits 7–0. Schemes other than zero are not decoded. Dingo uses ID 69 and Amaru uses ID 65, including signals with nonzero payloads. ID 67 is shared by Gerolamo and cardano-bean and is displayed as ambiguous using the generic icon. Amaru payload layout 0 decodes the UTC release day (days since 2026-01-01), including unreleased day zero. Its six unassigned flag bits are ignored; unsupported payload layouts remain opaque. Other payloads are not interpreted as software versions. The format is specified in Amaru’s [CIP-0203 block producer identifier decision record](https://github.com/pragma-org/amaru/blob/main/engineering-decision-records/040-cip-0203-block-producer-identifer.md) (the upstream filename spells “identifier” as “identifer”) and implemented in `crates/amaru-kernel/src/cardano/software_tag.rs`.

Unsignalled minor 0 is displayed as assumed Haskell cardano-node. Reserved release minors 1–15 with zero payload identify legacy Haskell nodes. Explicit opt-out ID 255, unregistered identifiers and unsupported schemes remain unidentified. All signals are producer declarations, not independent software attestations.
