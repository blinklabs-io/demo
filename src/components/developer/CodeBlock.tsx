import type { ReactNode } from "react";
import { CopyButton } from "../explorer/CopyButton";

const token =
  /(\/\/[^\n]*|^\s*#[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(const|let|for|of|if|else|throw|new|await|async|import|from|export|return|function|true|false|null)\b|\b(\d[\d.]*)\b/g;
const kinds = ["comment", "string", "keyword", "number"];

/** Splits one line into plain text and comment, string, keyword and number spans. */
function paint(line: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const match of line.matchAll(token)) {
    if (match.index > at) parts.push(line.slice(at, match.index));
    const kind = kinds[match.slice(1).findIndex((group) => group !== undefined)];
    parts.push(
      <span key={match.index} className={`code-${kind}`}>
        {match[0]}
      </span>,
    );
    at = match.index + match[0].length;
  }
  if (at < line.length) parts.push(line.slice(at));
  return parts;
}

/**
 * Code shown the way an editor shows it: a title bar with a copy button, a
 * numbered gutter and coloured syntax. `bar` replaces the plain title, for
 * example with a language picker.
 */
export function CodeBlock({
  code,
  title,
  bar,
  copyLabel,
}: {
  code: string;
  title?: string;
  bar?: ReactNode;
  copyLabel: string;
}) {
  const lines = code.replace(/\n$/, "").split("\n");
  return (
    <div className="code-editor">
      <div className="code-editor-bar">
        {bar ?? <span className="code-editor-title">{title}</span>}
        <CopyButton value={code} label={copyLabel} />
      </div>
      <pre className="developer-code">
        {lines.map((line, index) => (
          <span key={index} className="code-line">
            {paint(line)}
            {index < lines.length - 1 ? "\n" : ""}
          </span>
        ))}
      </pre>
    </div>
  );
}
