import { Link } from "../NetworkLink";

export function MainnetApps() {
  return <section className="markets-page mainnet-apps" aria-label="Cardano mainnet apps">
    <header className="market-hero"><div><span className="eyebrow">Cardano Mainnet</span><h1>Apps on the live chain.</h1><p>Swap and provide liquidity here, or open an app’s official workspace.</p></div></header>
    <div className="experience-grid">
      <article className="experience-card"><div className="experience-card-copy"><span className="eyebrow">Swaps · Liquidity</span><h2>Minswap V2</h2><p>Explore live pools, place swap and liquidity orders, and manage your pending orders.</p><Link to="/wallet/swap">Swap in the demo →</Link><p><Link to="/wallet/markets/liquidity">Manage liquidity →</Link></p><a href="https://app.minswap.org" target="_blank" rel="noopener noreferrer">Official Minswap app ↗</a></div></article>
      <article className="experience-card"><div className="experience-card-copy"><span className="eyebrow">Swaps · Liquidity</span><h2>SundaeSwap</h2><p>Trade Cardano tokens and provide liquidity in SundaeSwap’s mainnet app.</p><a href="https://app.sundae.fi/" target="_blank" rel="noopener noreferrer">Open SundaeSwap ↗</a></div></article>
      <article className="experience-card"><div className="experience-card-copy"><span className="eyebrow">Lending · Borrowing</span><h2>Liqwid</h2><p>Explore lending and collateralized borrowing in Liqwid’s mainnet app.</p><a href="https://app.liqwid.finance/" target="_blank" rel="noopener noreferrer">Open Liqwid ↗</a></div></article>
    </div>
  </section>;
}
