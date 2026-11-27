import "./product-art.css";

export type ProductArtKind =
  | "transactions"
  | "data"
  | "track"
  | "participate"
  | "mint"
  | "markets"
  | "mempool"
  | "proof"
  | "utxos"
  | "batch"
  | "network"
  | "bridge"
  | "leios";

const W = 0.866;

/** An isometric box. (x, y) is the centre of its base. */
function Cube({
  x,
  y,
  s = 20,
  h = s,
  lift,
  tone,
}: {
  x: number;
  y: number;
  s?: number;
  h?: number;
  lift?: boolean;
  tone?: "solid" | "wire";
}) {
  const w = s * W;
  const t = y - h;
  return (
    <g
      className={[lift && "art-lift", tone && `art-${tone}`]
        .filter(Boolean)
        .join(" ")}
    >
      <path
        className="art-left"
        d={`M${x - w} ${t}L${x} ${t + s / 2}V${y + s / 2}L${x - w} ${y}Z`}
      />
      <path
        className="art-right"
        d={`M${x + w} ${t}L${x} ${t + s / 2}V${y + s / 2}L${x + w} ${y}Z`}
      />
      <path
        className="art-top"
        d={`M${x} ${t - s / 2}L${x + w} ${t}L${x} ${t + s / 2}L${x - w} ${t}Z`}
      />
    </g>
  );
}

/** A coin seen from the same angle as the boxes. */
function Coin({
  x,
  y,
  lift,
  solid,
}: {
  x: number;
  y: number;
  lift?: boolean;
  solid?: boolean;
}) {
  return (
    <g className={[lift && "art-lift", solid && "art-solid"].filter(Boolean).join(" ")}>
      <path
        className="art-right"
        d={`M${x - 30} ${y}v7a30 12 0 0 0 60 0v-7`}
      />
      <ellipse className="art-top" cx={x} cy={y} rx="30" ry="12" />
    </g>
  );
}

const scenes: Record<ProductArtKind, React.ReactNode> = {
  mempool: (
    <>
      <path className="art-dim" d="M146 94H190" />
      <Cube x={58} y={92} s={11} />
      <Cube x={92} y={92} s={11} lift />
      <Cube x={126} y={92} s={11} />
      <Cube x={234} y={90} s={30} tone="solid" />
    </>
  ),
  track: (
    <>
      <path className="art-dim" d="M60 88H232" />
      <path className="art-line" d="M60 88H188" />
      <circle className="art-dot" cx="60" cy="88" r="6" />
      <circle className="art-dot" cx="124" cy="88" r="6" />
      <circle className="art-ring art-pulse" cx="188" cy="88" r="13" />
      <circle className="art-dot" cx="188" cy="88" r="6" />
      <Cube x={256} y={90} s={18} lift />
    </>
  ),
  transactions: (
    <>
      <path className="art-dim" d="M120 46V100M200 46V100" />
      <Cube x={160} y={108} s={46} h={5} />
      <Cube x={160} y={84} s={46} h={5} lift />
      <Cube x={160} y={60} s={46} h={5} lift tone="solid" />
    </>
  ),
  data: (
    <>
      <Cube x={160} y={100} s={40} tone="wire" />
      <Cube x={160} y={78} s={18} lift tone="solid" />
      <path className="art-line" d="M88 58c-10 0-6 14-14 14 8 0 4 14 14 14" />
      <path className="art-line" d="M232 58c10 0 6 14 14 14-8 0-4 14-14 14" />
    </>
  ),
  participate: (
    <>
      <Cube x={108} y={102} s={18} h={22} />
      <Cube x={160} y={102} s={18} h={50} lift tone="solid" />
      <Cube x={212} y={102} s={18} h={34} />
      <path className="art-dim" d="M76 116H244" />
    </>
  ),
  mint: (
    <>
      <Coin x={150} y={104} />
      <Coin x={150} y={92} />
      <Coin x={150} y={80} />
      <Coin x={150} y={58} lift solid />
      <Coin x={226} y={108} />
    </>
  ),
  markets: (
    <>
      <Cube x={108} y={100} s={24} h={34} />
      <Cube x={212} y={100} s={24} h={18} tone="solid" />
      <path className="art-line" d="M124 44C148 28 178 30 198 54" />
      <path className="art-line" d="M199 44v11h-11" />
      <path className="art-dim" d="M196 124C174 136 146 136 124 124" />
    </>
  ),
  proof: (
    <>
      <Cube x={146} y={100} s={48} h={4} />
      <path className="art-line" d="M124 88l22 12M134 82l22 12M144 76l12 7" />
      <g className="art-lift">
        <circle className="art-seal" cx="214" cy="58" r="20" />
        <path className="art-check" d="M205 58l7 7 12-14" />
      </g>
    </>
  ),
  utxos: (
    <>
      <path
        className="art-dim"
        d="M74 62C108 62 104 88 136 88M74 114C108 114 104 90 136 90M184 88C214 88 212 66 244 66M184 90C214 90 212 112 244 112"
      />
      <Cube x={62} y={66} s={11} />
      <Cube x={62} y={118} s={11} />
      <Cube x={160} y={96} s={24} lift tone="solid" />
      <Cube x={258} y={70} s={12} />
      <Cube x={258} y={116} s={12} />
    </>
  ),
  batch: (
    <>
      <path
        className="art-dim"
        d="M96 88C150 88 150 44 232 44M96 90H240M96 92C150 92 150 132 232 132M96 89C160 89 170 68 244 68M96 91C160 91 170 112 244 112"
      />
      <Cube x={74} y={94} s={22} tone="solid" />
      <circle className="art-dot art-lift" cx="238" cy="44" r="5" />
      <circle className="art-dot" cx="250" cy="68" r="5" />
      <circle className="art-dot art-lift" cx="246" cy="90" r="5" />
      <circle className="art-dot" cx="250" cy="112" r="5" />
      <circle className="art-dot art-lift" cx="238" cy="132" r="5" />
    </>
  ),
  network: (
    <>
      <ellipse className="art-dim" cx="160" cy="86" rx="100" ry="36" />
      <Cube x={160} y={92} s={24} lift tone="solid" />
      <Cube x={60} y={88} s={9} />
      <Cube x={260} y={88} s={9} />
      <Cube x={112} y={58} s={9} />
      <Cube x={208} y={120} s={9} />
    </>
  ),
  bridge: (
    <>
      <path className="art-dim" d="M84 62C120 14 200 14 236 62" />
      <Cube x={84} y={100} s={22} />
      <Cube x={236} y={100} s={22} />
      <Cube x={160} y={34} s={9} lift tone="solid" />
    </>
  ),
  leios: (
    <>
      <path className="art-dim" d="M142 74H178M142 88H204M142 102H230" />
      <Cube x={120} y={106} s={20} h={56} />
      <Cube x={190} y={78} s={10} lift tone="solid" />
      <Cube x={216} y={92} s={10} />
      <Cube x={242} y={106} s={10} />
    </>
  ),
};

export function ProductArt({ kind }: { kind: ProductArtKind }) {
  return (
    <svg
      className="product-art"
      viewBox="30 14 260 136"
      aria-hidden="true"
      focusable="false"
    >
      {scenes[kind]}
    </svg>
  );
}
