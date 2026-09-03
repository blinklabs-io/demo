import { createBrowserRouter, Navigate } from "react-router";
import { AppShell } from "./components/layout/AppShell";
import ExplorerOverview from "./pages/explorer/ExplorerOverview";
import BlockDetail from "./pages/explorer/BlockDetail";
import TxDetail from "./pages/explorer/TxDetail";
import LookupResolver from "./pages/explorer/LookupResolver";
import MempoolFeed from "./pages/explorer/MempoolFeed";
import AddressDetail from "./pages/explorer/AddressDetail";
import AccountDetail from "./pages/explorer/AccountDetail";
import AssetDetail from "./pages/explorer/AssetDetail";
import EpochDetail from "./pages/explorer/EpochDetail";
import PoolList from "./pages/explorer/PoolList";
import PoolDetail from "./pages/explorer/PoolDetail";
import DRepList from "./pages/explorer/DRepList";
import DRepDetail from "./pages/explorer/DRepDetail";
import WalletHome from "./pages/wallet/WalletHome";
import WalletSend from "./pages/wallet/WalletSend";
import WalletSwap from "./pages/wallet/WalletSwap";
import WalletDelegate from "./pages/wallet/WalletDelegate";
import NotFound from "./pages/NotFound";

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/explorer" replace /> },
      { path: "explorer", element: <ExplorerOverview /> },
      { path: "explorer/block/:id", element: <BlockDetail /> },
      { path: "explorer/tx/:hash", element: <TxDetail /> },
      { path: "explorer/lookup/:hash", element: <LookupResolver /> },
      { path: "explorer/mempool", element: <MempoolFeed /> },
      { path: "explorer/address/:address", element: <AddressDetail /> },
      { path: "explorer/account/:stakeAddress", element: <AccountDetail /> },
      { path: "explorer/asset/:assetId", element: <AssetDetail /> },
      { path: "explorer/epoch", element: <EpochDetail /> },
      { path: "explorer/epoch/:epoch", element: <EpochDetail /> },
      { path: "explorer/pools", element: <PoolList /> },
      { path: "explorer/pool/:poolId", element: <PoolDetail /> },
      { path: "explorer/dreps", element: <DRepList /> },
      { path: "explorer/drep/:drepId", element: <DRepDetail /> },
      { path: "wallet", element: <WalletHome /> },
      { path: "wallet/send", element: <WalletSend /> },
      { path: "wallet/swap", element: <WalletSwap /> },
      { path: "wallet/delegate", element: <WalletDelegate /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
