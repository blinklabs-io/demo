import { Core } from "@blaze-cardano/sdk";
import { bytesToHex } from "../../lib/dingo/utxorpc/bytes";

export function ChainMark({ value }: { value: string }) {
  const seed = Core.blake2b_256(
    Core.HexBlob(bytesToHex(new TextEncoder().encode(value.toLowerCase()))),
  );
  const hue = parseInt(seed.slice(0, 4), 16) % 360;
  return (
    <svg viewBox="0 0 110 110" aria-hidden="true">
      <rect
        x="1"
        y="1"
        width="108"
        height="108"
        rx="25"
        fill={`hsl(${hue} 35% 16%)`}
        stroke={`hsl(${hue} 40% 40%)`}
      />
      {Array.from({ length: 25 }, (_, index) => {
        const x = index % 5;
        const y = Math.floor(index / 5);
        const source = y * 3 + Math.min(x, 4 - x);
        return parseInt(seed[source], 16) % 2 === 0 ? (
          <rect
            key={index}
            x={17 + x * 16}
            y={17 + y * 16}
            width="13"
            height="13"
            rx="3"
            fill={`hsl(${hue} 65% ${55 + y * 4}%)`}
          />
        ) : null;
      })}
    </svg>
  );
}
