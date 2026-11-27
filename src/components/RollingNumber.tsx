/**
 * A live figure whose characters roll in when they change. Characters are
 * keyed from the right, so only the digits that actually changed animate.
 */
export function RollingNumber({ value }: { value: string }) {
  const chars = [...value];
  return (
    <span className="rolling">
      <span className="sr-only">{value}</span>
      <span aria-hidden="true">
        {chars.map((char, i) => (
          <span key={`${chars.length - i}:${char}`}>{char}</span>
        ))}
      </span>
    </span>
  );
}
