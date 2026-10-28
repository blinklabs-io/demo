import {
  Core,
  Provider,
  findScriptRefInAddressUtxos,
} from "@blaze-cardano/sdk";
import {
  CardanoQueryClient,
  CardanoSubmitClient,
  type CardanoUtxo,
} from "@utxorpc/sdk";
import { DINGO_CONFIG } from "../config";
import { blockfrostFetch, BlockfrostError } from "../blockfrost";
import { bytesToHex, hexToBytes } from "./bytes";

export class DingoProvider extends Provider {
  readonly queryClient = new CardanoQueryClient({
    uri: DINGO_CONFIG.utxorpcUrl,
  });
  readonly submitClient = new CardanoSubmitClient({
    uri: DINGO_CONFIG.utxorpcUrl,
  });

  constructor() {
    super(Core.NetworkId.Testnet, "cardano-preview");
  }

  async getParameters(): Promise<Core.ProtocolParameters> {
    const p = await blockfrostFetch<Record<string, unknown>>(
      "/api/v0/epochs/latest/parameters",
    );
    const number = (key: string) => {
      const n = Number(p[key]);
      if (p[key] == null || !Number.isFinite(n) || n < 0)
        throw new Error(`Dingo returned invalid protocol parameter ${key}.`);
      return n;
    };
    const models = p.cost_models_raw as Record<string, number[]> | null;
    const costModels = new Map<Core.PlutusLanguageVersion, number[]>();
    for (const [name, language] of [
      ["PlutusV1", Core.PlutusLanguageVersion.V1],
      ["PlutusV2", Core.PlutusLanguageVersion.V2],
      ["PlutusV3", Core.PlutusLanguageVersion.V3],
    ] as const) {
      const values = models?.[name];
      if (
        !Array.isArray(values) ||
        !values.length ||
        values.some((v) => !Number.isSafeInteger(v))
      )
        throw new Error(`Dingo did not return a valid ${name} cost model.`);
      costModels.set(language, values);
    }
    return {
      coinsPerUtxoByte: number("coins_per_utxo_size"),
      costModels,
      maxTxSize: number("max_tx_size"),
      minFeeCoefficient: number("min_fee_a"),
      minFeeConstant: number("min_fee_b"),
      maxBlockBodySize: number("max_block_size"),
      maxBlockHeaderSize: number("max_block_header_size"),
      stakeKeyDeposit: number("key_deposit"),
      poolDeposit: number("pool_deposit"),
      poolRetirementEpochBound: number("e_max"),
      desiredNumberOfPools: number("n_opt"),
      poolInfluence: String(number("a0")),
      monetaryExpansion: String(number("rho")),
      treasuryExpansion: String(number("tau")),
      minPoolCost: number("min_pool_cost"),
      protocolVersion: {
        major: number("protocol_major_ver"),
        minor: number("protocol_minor_ver"),
      },
      maxValueSize: number("max_val_size"),
      collateralPercentage: number("collateral_percent"),
      maxCollateralInputs: number("max_collateral_inputs"),
      prices: { memory: number("price_mem"), steps: number("price_step") },
      maxExecutionUnitsPerTransaction: {
        memory: number("max_tx_ex_mem"),
        steps: number("max_tx_ex_steps"),
      },
      maxExecutionUnitsPerBlock: {
        memory: number("max_block_ex_mem"),
        steps: number("max_block_ex_steps"),
      },
      minFeeReferenceScripts: {
        base: number("min_fee_ref_script_cost_per_byte"),
        range: 25_600,
        multiplier: 1.2,
      },
    };
  }

  private decode(utxos: CardanoUtxo[]) {
    return utxos.map((u) => {
      if (!u.nativeBytes?.length)
        throw new Error("Dingo returned a UTxO without its output CBOR.");
      return new Core.TransactionUnspentOutput(
        new Core.TransactionInput(
          Core.TransactionId(bytesToHex(u.txoRef.hash)),
          BigInt(u.txoRef.index),
        ),
        Core.TransactionOutput.fromCbor(Core.HexBlob.fromBytes(u.nativeBytes)),
      );
    });
  }
  async getUnspentOutputs(address: Core.Address) {
    return this.decode(
      await this.queryClient.searchUtxosByAddress(
        hexToBytes(address.toBytes()),
      ),
    );
  }
  async getUnspentOutputsWithAsset(address: Core.Address, unit: Core.AssetId) {
    return this.decode(
      await this.queryClient.searchUtxosByAddressWithAsset(
        hexToBytes(address.toBytes()),
        hexToBytes(unit.slice(0, 56)),
        hexToBytes(unit.slice(56)),
      ),
    );
  }
  async getUnspentOutputByNFT(unit: Core.AssetId) {
    const utxos = this.decode(
      await this.queryClient.searchUtxosByAsset(
        hexToBytes(unit.slice(0, 56)),
        hexToBytes(unit.slice(56)),
      ),
    );
    if (
      utxos.length !== 1 ||
      utxos[0].output().amount().multiasset()?.get(unit) !== 1n
    )
      throw new Error(
        "The requested NFT does not identify exactly one unspent output.",
      );
    return utxos[0];
  }
  async resolveUnspentOutputs(inputs: Core.TransactionInput[]) {
    if (!inputs.length) return [];
    return this.decode(
      await this.queryClient.readUtxosByOutputRef(
        inputs.map((i) => ({
          txHash: hexToBytes(i.transactionId()),
          outputIndex: Number(i.index()),
        })),
      ),
    );
  }
  async resolveDatum(hash: Core.DatumHash) {
    const response = await this.queryClient.inner.readData({
      keys: [hexToBytes(hash)],
    });
    const data = response.values.find(
      (v) => bytesToHex(v.key) === hash,
    )?.nativeBytes;
    if (!data?.length)
      throw new Error(`Dingo could not resolve datum ${hash}.`);
    const datum = Core.PlutusData.fromCbor(Core.HexBlob.fromBytes(data));
    if (datum.hash() !== hash)
      throw new Error("Dingo returned a datum with a mismatched hash.");
    return datum;
  }
  resolveScriptRef(
    script: Core.Script | Core.Hash28ByteBase16,
    address?: Core.Address,
  ) {
    return findScriptRefInAddressUtxos(this, script, address);
  }
  async postTransactionToChain(tx: Core.Transaction) {
    if ((await this.queryClient.readGenesis()).networkMagic !== 2)
      throw new Error("Dingo submission requires Preview.");
    const id = Core.TransactionId(
      bytesToHex(await this.submitClient.submitTx(hexToBytes(tx.toCbor()))),
    );
    if (id !== tx.getId())
      throw new Error("Dingo returned a mismatched transaction hash.");
    return id;
  }
  async awaitTransactionConfirmation(id: Core.TransactionId, timeout = 60_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        const tx = await blockfrostFetch<{
          hash: string;
          block: string;
          valid_contract: boolean;
        }>(`/api/v0/txs/${id}`);
        return tx.hash === id && !!tx.block && tx.valid_contract === true;
      } catch (error) {
        if (!(error instanceof BlockfrostError && error.status === 404))
          throw error;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(2000, Math.max(0, deadline - Date.now()))),
      );
    }
    return false;
  }
  async evaluateTransaction(
    tx: Core.Transaction,
    additional: Core.TransactionUnspentOutput[],
  ) {
    // EvalTx resolves ledger inputs itself; it cannot evaluate unpublished chained outputs.
    const resolved = await this.resolveUnspentOutputs(
      additional.map((u) => u.input()),
    );
    for (const utxo of additional) {
      const found = resolved.find(
        (u) => u.input().toCbor() === utxo.input().toCbor(),
      );
      if (!found || found.output().toCbor() !== utxo.output().toCbor())
        throw new Error(
          "Dingo evaluation requires additional inputs to already exist on chain.",
        );
    }
    const report = (await this.submitClient.evalTx(hexToBytes(tx.toCbor())))
      .report?.chain;
    if (report?.case !== "cardano")
      throw new Error("Dingo returned no Cardano evaluation report.");
    if (report.value.errors.length)
      throw new Error(
        `Dingo evaluation failed: ${report.value.errors.map((e) => e.msg).join("; ")}`,
      );
    const originals = tx.witnessSet().redeemers()?.values() ?? [];
    const results = report.value.redeemers;
    if (results.length !== originals.length)
      throw new Error("Dingo did not evaluate every redeemer.");
    const evaluated = originals.map((r) => {
      // UTxO RPC purposes are one-based; ledger redeemer tags are zero-based.
      const matches = results.filter(
        (e) => e.purpose === r.tag() + 1 && BigInt(e.index) === r.index(),
      );
      const units = matches[0]?.exUnits;
      if (
        matches.length !== 1 ||
        !units ||
        units.memory < 0n ||
        units.steps < 0n
      )
        throw new Error("Dingo returned an invalid redeemer evaluation.");
      return new Core.Redeemer(
        r.tag(),
        r.index(),
        r.data(),
        new Core.ExUnits(units.memory, units.steps),
      ).toCore();
    });
    return Core.Redeemers.fromCore(evaluated);
  }
}
