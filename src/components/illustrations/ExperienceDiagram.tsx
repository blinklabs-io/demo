import { nativeSymbol } from "../../lib/format";
import { useId } from "react";
import "./experience-diagram.css";

export type ExperienceDiagramKind =
  "mempool" | "utxo" | "payments" | "network" | "studio";

export function ExperienceDiagram({ kind }: { kind: ExperienceDiagramKind }) {
  const id = useId();
  const palette = {
    mempool: ["#c5b0ff", "#65dfd1"],
    utxo: ["#70ebc5", "#7db8ff"],
    payments: ["#e4b6ff", "#ffc97e"],
    network: ["#80c5ff", "#a99bff"],
    studio: ["#ffd27e", "#78e4c5"],
  }[kind];
  return (
    <svg
      className="experience-diagram"
      viewBox="0 0 260 130"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-surface`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor={palette[0]} stopOpacity=".25" />
          <stop offset="1" stopColor={palette[1]} stopOpacity=".06" />
        </linearGradient>
        <linearGradient id={`${id}-line`}>
          <stop stopColor={palette[0]} />
          <stop offset="1" stopColor={palette[1]} />
        </linearGradient>
      </defs>
      {kind === "mempool" ? (
        <>
          <path
            d="M58 32C88 32 80 65 111 65M58 65H111M58 98C88 98 80 65 111 65"
            fill="none"
            stroke={`url(#${id}-line)`}
            strokeWidth="2"
          />
          {[22, 55, 88].map((y, i) => (
            <g key={y}>
              <rect
                x="16"
                y={y}
                width="45"
                height="22"
                rx="6"
                fill={`url(#${id}-surface)`}
                stroke={palette[i === 1 ? 1 : 0]}
              />
              <rect
                x="23"
                y={y + 7}
                width="7"
                height="7"
                rx="2"
                fill={palette[i === 1 ? 1 : 0]}
              />
              <path
                d={`M36 ${y + 8}h17M36 ${y + 14}h11`}
                stroke={palette[0]}
                strokeOpacity=".6"
                strokeWidth="1.5"
              />
            </g>
          ))}
          <circle
            cx="123"
            cy="65"
            r="16"
            fill="#1b3342"
            stroke="#78e6d5"
            strokeWidth="1.5"
          />
          <path
            d="M117 65h12m-5-5 5 5-5 5"
            stroke="#b5fff0"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M141 65h34"
            stroke="#77e5d1"
            strokeWidth="2"
            strokeDasharray="3 5"
          />
          <path
            d="m180 42 30-17 31 17-31 18Z"
            fill="#42345c"
            stroke="#d1b6ff"
            strokeWidth="1.5"
          />
          <path
            d="M180 42v39l30 18V60Z"
            fill="#293745"
            stroke="#8dd8dc"
            strokeWidth="1.5"
          />
          <path
            d="m210 60 31-18v39l-31 18Z"
            fill="#173e3c"
            stroke="#77e5d1"
            strokeWidth="1.5"
          />
          <path
            d="m187 57 16 9m-16 3 16 9m15-12 15-9m-15 21 15-9"
            stroke="#b5d9df"
            strokeOpacity=".5"
          />
          <text x="39" y="123" textAnchor="middle">
            QUEUE
          </text>
          <text x="210" y="119" textAnchor="middle">
            BLOCK
          </text>
        </>
      ) : kind === "utxo" ? (
        <>
          <path
            d="M65 35C92 35 84 65 112 65M65 95C92 95 84 65 112 65M140 65C161 65 157 28 185 28M140 65H185M140 65C161 65 157 102 185 102"
            fill="none"
            stroke={`url(#${id}-line)`}
            strokeWidth="2"
          />
          {[22, 82].map((y) => (
            <g key={y}>
              <rect
                x="18"
                y={y}
                width="48"
                height="26"
                rx="7"
                fill={`url(#${id}-surface)`}
                stroke="#70ebc5"
              />
              <circle
                cx="31"
                cy={y + 13}
                r="6"
                fill="#70ebc5"
                fillOpacity=".3"
                stroke="#70ebc5"
              />
              <path
                d={`M43 ${y + 10}h14M43 ${y + 16}h9`}
                stroke="#93d7c7"
                strokeWidth="1.5"
              />
            </g>
          ))}
          <rect
            x="111"
            y="50"
            width="30"
            height="30"
            rx="9"
            fill="#174741"
            stroke="#a3f5dc"
            strokeWidth="1.5"
            transform="rotate(45 126 65)"
          />
          <path
            d="m119 65 5 5 10-11"
            fill="none"
            stroke="#bdffe9"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {[15, 52, 89].map((y, i) => (
            <g key={y}>
              <rect
                x="185"
                y={y}
                width="55"
                height="26"
                rx="7"
                fill={i === 1 ? "#293c61" : "#123d3b"}
                stroke={i === 1 ? "#8dbbff" : "#70ebc5"}
              />
              <circle
                cx="198"
                cy={y + 13}
                r="5"
                fill={i === 1 ? "#8dbbff" : "#70ebc5"}
              />
              <path
                d={`M210 ${y + 10}h20M210 ${y + 16}h13`}
                stroke="#b4dbda"
                strokeOpacity=".6"
                strokeWidth="1.5"
              />
            </g>
          ))}
          <text x="42" y="123" textAnchor="middle">
            MERGE
          </text>
          <text x="213" y="128" textAnchor="middle">
            SPLIT
          </text>
        </>
      ) : kind === "payments" ? (
        <>
          <path
            d="M94 65h33m0 0c23 0 13-36 42-36m-42 36h73m-73 0c23 0 13 36 42 36"
            stroke={`url(#${id}-line)`}
            strokeWidth="2"
            fill="none"
          />
          <rect
            x="18"
            y="39"
            width="76"
            height="51"
            rx="12"
            fill={`url(#${id}-surface)`}
            stroke="#e4b6ff"
            strokeWidth="1.5"
          />
          <path
            d="M28 39v-7h49a7 7 0 0 1 7 7"
            fill="none"
            stroke="#c6a7df"
            strokeWidth="1.5"
          />
          <rect
            x="70"
            y="56"
            width="29"
            height="18"
            rx="5"
            fill="#3e3356"
            stroke="#e4b6ff"
          />
          <circle cx="80" cy="65" r="2" fill="#ffe0a1" />
          <text x="46" y="75" className="diagram-currency" style={{ fontSize: nativeSymbol().length > 1 ? 9 : undefined }}>
            {nativeSymbol()}
          </text>
          {[
            [183, 29],
            [218, 65],
            [183, 101],
          ].map(([x, y], i) => (
            <g key={y}>
              <circle
                cx={x}
                cy={y}
                r="17"
                fill={i === 1 ? "#3e3452" : "#332d30"}
                stroke={i === 1 ? "#e4b6ff" : "#ffc97e"}
                strokeWidth="1.5"
              />
              <circle
                cx={x}
                cy={y - 4}
                r="4"
                fill={i === 1 ? "#e4b6ff" : "#ffc97e"}
              />
              <path
                d={`M${x - 8} ${y + 9}a8 8 0 0 1 16 0`}
                fill="none"
                stroke={i === 1 ? "#e4b6ff" : "#ffc97e"}
                strokeWidth="2"
              />
            </g>
          ))}
          <circle cx="127" cy="65" r="4" fill="#ffe0a1" />
          <text x="56" y="113" textAnchor="middle">
            ONE WALLET
          </text>
        </>
      ) : kind === "network" ? (
        <>
          <ellipse
            cx="130"
            cy="65"
            rx="90"
            ry="46"
            fill="none"
            stroke="#597fa4"
            strokeOpacity=".45"
            strokeDasharray="3 6"
          />
          <path
            d="M130 65 48 38m82 27L76 103m54-38 53 39m-53-39 83-27m-83 27V15"
            stroke={`url(#${id}-line)`}
            strokeWidth="1.5"
          />
          <path
            d="m130 42 21 12v23l-21 12-21-12V54Z"
            fill={`url(#${id}-surface)`}
            stroke="#96d8ff"
            strokeWidth="1.5"
          />
          <text x="130" y="76" textAnchor="middle" className="diagram-node">
            d
          </text>
          {[
            [48, 38, "REST"],
            [213, 38, "RPC"],
            [76, 104, "SYNC"],
            [183, 104, "PEER"],
          ].map(([x, y, label], i) => (
            <g key={label}>
              <rect
                x={Number(x) - 23}
                y={Number(y) - 12}
                width="46"
                height="24"
                rx="7"
                fill="#172a40"
                stroke={i % 2 ? "#b6aaff" : "#80c5ff"}
              />
              <text
                x={x}
                y={Number(y) + 3}
                textAnchor="middle"
                className="diagram-node-label"
              >
                {label}
              </text>
            </g>
          ))}
          <circle cx="130" cy="15" r="6" fill="#89e6cf" />
          <circle
            cx="130"
            cy="15"
            r="12"
            fill="none"
            stroke="#89e6cf"
            strokeOpacity=".25"
          />
          <circle cx="87" cy="52" r="3" fill="#89e6cf" />
          <circle cx="171" cy="52" r="3" fill="#b6aaff" />
          <circle cx="105" cy="84" r="3" fill="#80c5ff" />
        </>
      ) : (
        <>
          <rect
            x="59"
            y="14"
            width="146"
            height="103"
            rx="11"
            fill={`url(#${id}-surface)`}
            stroke="#d6b774"
            strokeWidth="1.5"
          />
          <path d="M59 37h146" stroke="#d6b774" strokeOpacity=".45" />
          {[70, 80, 90].map((x, i) => (
            <circle
              key={x}
              cx={x}
              cy="26"
              r="2.3"
              fill={i === 0 ? "#ffd27e" : i === 1 ? "#78e4c5" : "#b6aaff"}
            />
          ))}
          <path
            d="M34 65h30m108 0h40"
            stroke="#d6b774"
            strokeWidth="1.5"
            strokeDasharray="3 4"
          />
          <rect
            x="15"
            y="52"
            width="28"
            height="28"
            rx="7"
            fill="#3e3729"
            stroke="#ffd27e"
            transform="rotate(-12 29 66)"
          />
          <path d="M24 61h10m-10 7h10" stroke="#ffe2a6" strokeWidth="1.5" />
          <rect
            x="76"
            y="51"
            width="36"
            height="25"
            rx="5"
            fill="#454033"
            stroke="#ffd27e"
          />
          <path d="M84 60h20m-20 7h13" stroke="#ffe2a6" strokeWidth="1.5" />
          <path
            d="M114 64h23m-5-4 5 4-5 4"
            fill="none"
            stroke="#b5d5bf"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect
            x="142"
            y="51"
            width="45"
            height="25"
            rx="5"
            fill="#23443c"
            stroke="#78e4c5"
          />
          <path d="M150 60h28m-28 7h18" stroke="#a9f6d8" strokeWidth="1.5" />
          <rect x="77" y="88" width="110" height="16" rx="5" fill="#152d2a" />
          <path
            d="m88 92-4 4 4 4m78-8 4 4-4 4"
            fill="none"
            stroke="#78e4c5"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <text
            x="128"
            y="99"
            textAnchor="middle"
            className="diagram-code-label"
          >
            CBOR
          </text>
          <circle
            cx="226"
            cy="65"
            r="16"
            fill="#22483d"
            stroke="#78e4c5"
            strokeWidth="1.5"
          />
          <path
            d="m218 65 5 5 10-11"
            fill="none"
            stroke="#b7ffdf"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
}
