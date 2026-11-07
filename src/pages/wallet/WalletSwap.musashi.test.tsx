import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import WalletSwap from "./WalletSwap";
vi.mock("../../components/markets/MinswapMarket", () => ({ MinswapMarket: () => <p>Foreign market</p> }));
vi.mock("../../lib/dingo/config", () => ({
  DINGO_NETWORK: { id: "musashi", label: "Musashi", networkMagic: 164 },
  DINGO_CONFIG: {
    blockfrostUrl: "https://rest.example",
    utxorpcUrl: "https://rpc.example",
    meshUrl: "https://mesh.example",
  },
}));
it("routes Musashi visitors to explicit deployed market networks without loading a foreign market", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <WalletSwap />
    </MemoryRouter>,
  );
  expect(html).toContain("/wallet/swap?network=preview");
  expect(html).toContain("/wallet/swap?network=preprod");
  expect(html).toContain("/explorer/leios?network=musashi");
  expect(html).not.toContain("Foreign market");
  expect(html).not.toContain("SundaeSwap market version");
});
