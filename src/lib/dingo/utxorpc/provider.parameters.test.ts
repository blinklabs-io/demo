// @vitest-environment node
import { Core } from "@blaze-cardano/sdk";
import { afterEach, expect, it, vi } from "vitest";
import { blockfrostFetch } from "../blockfrost";
import { DingoProvider } from "./DingoProvider";
vi.mock("../config", () => ({ DINGO_NETWORK: { id: "prime-testnet", label: "Prime Testnet", networkMagic: 3311 }, DINGO_CONFIG: { blockfrostUrl: "https://rest.example", utxorpcUrl: "https://rpc.example" } }));
vi.mock("../blockfrost", () => ({ blockfrostFetch: vi.fn() }));
afterEach(() => vi.clearAllMocks());
function parameters(major: number) {
  return { protocol_major_ver: major, protocol_minor_ver: 0, cost_models_raw: { PlutusV1: [1, 2], PlutusV2: [3, 4], ...(major >= 9 ? { PlutusV3: [5, 6] } : {}) }, coins_per_utxo_size: "4310", max_tx_size: 16384, min_fee_a: 47, min_fee_b: 158298, max_block_size: 65536, max_block_header_size: 1100, key_deposit: "0", pool_deposit: "0", e_max: 18, n_opt: 100, a0: 0, rho: 0.0038, tau: 0.00000001, min_pool_cost: "0", max_val_size: "5000", collateral_percent: 150, max_collateral_inputs: 3, price_mem: 5.77, price_step: 0.00721, max_tx_ex_mem: "16000000", max_tx_ex_steps: "10000000000", max_block_ex_mem: "80000000", max_block_ex_steps: "40000000000", min_fee_ref_script_cost_per_byte: major >= 9 ? 15 : null };
}
it("maps Babbage parameters without inventing Conway cost models or fees", async () => {
  vi.mocked(blockfrostFetch).mockResolvedValue(parameters(7));
  const result = await new DingoProvider().getParameters();
  expect(result.protocolVersion).toEqual({ major: 7, minor: 0 });
  expect([...result.costModels.keys()]).toEqual([Core.PlutusLanguageVersion.V1, Core.PlutusLanguageVersion.V2]);
  expect(result.minFeeReferenceScripts).toBeUndefined();
  expect(result.minFeeCoefficient).toBe(47);
});
it("requires all active Conway models and reference-script fees", async () => {
  const value = parameters(9);
  vi.mocked(blockfrostFetch).mockResolvedValue(value);
  const provider = new DingoProvider();
  expect((await provider.getParameters()).costModels.get(Core.PlutusLanguageVersion.V3)).toEqual([5, 6]);
  value.min_fee_ref_script_cost_per_byte = null;
  await expect(provider.getParameters()).rejects.toThrow("min_fee_ref_script_cost_per_byte");
  value.min_fee_ref_script_cost_per_byte = 15;
  delete value.cost_models_raw.PlutusV3;
  await expect(provider.getParameters()).rejects.toThrow("PlutusV3 cost model");
});
it("rejects malformed active models and protocol versions", async () => {
  const value = parameters(7);
  vi.mocked(blockfrostFetch).mockResolvedValue(value);
  value.cost_models_raw.PlutusV2 = [];
  await expect(new DingoProvider().getParameters()).rejects.toThrow("PlutusV2 cost model");
  value.protocol_major_ver = 7.5;
  await expect(new DingoProvider().getParameters()).rejects.toThrow("protocol version");
});
