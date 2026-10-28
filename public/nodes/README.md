# Node icons

Original assets from [PRAGMA node diversity conformance](https://github.com/pragma-org/node-diversity-conformance/tree/main/nodes), licensed under Apache-2.0 (see LICENSE).

- dingo.png: nodes/dingo/logo.png
- bean.svg: nodes/cardano-bean/logo.svg
- cardano-node.svg: nodes/cardano-node/logo.svg
- amaru.svg: nodes/amaru/logo.svg
- unknown.svg: generic node icon created for this application

Block displays identify Dingo by protocol minor 69 and Bean by minor 67. Headers 11.1 and 11.2 are identified as Haskell cardano-node. Other unrecognized versions are unidentified; minor 0 is also used by other implementations following the protocol parameters. Amaru currently uses the ledger protocol version without a distinct implementation marker: `crates/amaru-node/src/stages/build_node.rs` reads `state.protocol_version()`, and `crates/amaru-consensus/src/stages/forge_block/protocol.rs` copies it into `HeaderDraft`. Its icon is retained here but cannot be selected reliably from a header version.
