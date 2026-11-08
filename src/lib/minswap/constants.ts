import { MAINNET_MINSWAP_V2 } from "./mainnet";
export { MAINNET_MINSWAP_V2 } from "./mainnet";
import { DINGO_NETWORK } from "../dingo/config";
// Deployment identifiers from canonical @minswap/sdk DexV2Constant TESTNET configuration.
export const PREPROD_MINSWAP_V2 = {
  poolAuthenAsset:
    "d6aae2059baee188f74917493cf7637e679cd219bdfbbf4dcbeb1d0b4d5350",
  lpPolicyId: "d6aae2059baee188f74917493cf7637e679cd219bdfbbf4dcbeb1d0b",
  globalSettingAsset:
    "d6aae2059baee188f74917493cf7637e679cd219bdfbbf4dcbeb1d0b4d534753",
  poolScriptHash: "d6ba9b7509eac866288ff5072d2a18205ac56f744bc82dcd808cb8fe",
  orderScriptHash: "da9525463841173ad1230b1d5a1b5d0a3116bbdeb4412327148a1b7a",
  orderEnterpriseAddress:
    "addr_test1wrdf2f2x8pq3wwk3yv936ksmt59rz94mm66yzge8zj9pk7s0kjph3",
  poolCreationAddress:
    "addr_test1zrtt4xm4p84vse3g3l6swtf2rqs943t0w39ustwdszxt3l5rajt8r8wqtygrfduwgukk73m5gcnplmztc5tl5ngy0upqhns793",
} as const;
export const POOL_ADA_BUFFER = 4_500_000n;
export const ORDER_DEPOSIT_ADA = 2_000_000n;
export const BATCHER_FEE = 2_000_000n;
export const MAX_LIQUIDITY = 9_223_372_036_854_775_807n;
export const BURNED_LIQUIDITY = 10n;



const deployments = {
  mainnet: { contracts: MAINNET_MINSWAP_V2, orderReference: { txHash: "cf4ecddde0d81f9ce8fcc881a85eb1f8ccdaf6807f03fea4cd02da896a621776", index: 0n } },
  preprod: { contracts: PREPROD_MINSWAP_V2, orderReference: { txHash: "8c98f0530cba144d264fbd2731488af25257d7ce6a0cd1586fc7209363724f03", index: 0n } },
} as const;
function deployment() {
  if (DINGO_NETWORK.id !== "mainnet" && DINGO_NETWORK.id !== "preprod")
    throw new Error("Minswap V2 requires Mainnet or Preprod.");
  return deployments[DINGO_NETWORK.id];
}
export function minswapDeployment() { return deployment().contracts; }
export function minswapOrderReference() { return deployment().orderReference; }
