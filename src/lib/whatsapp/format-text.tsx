import type { ReactNode } from "react";

/**
 * Renders WhatsApp's actual text-formatting shortcodes as real markup,
 * instead of showing the raw asterisks/underscores. Matches Meta's own
 * spec (single asterisk bold, not double) so a preview here matches
 * what the customer's WhatsApp client renders -- not a guess at
 * Markdown conventions.
 *
 *   *bold*        -> <strong>
 *   _italic_      -> <em>
 *   ~strikethrough~ -> <s>
 *   ```monospace``` -> <code>
 *
 * Newlines are preserved (each line becomes its own text run joined by
 * <br/>); the caller doesn't need `whitespace-pre-wrap` since line
 * breaks are handled here explicitly.
 */
export function formatWhatsAppText(text: string): ReactNode[] {
  const lines = text.split("\n");
  const nodes: ReactNode[] = [];
  lines.forEach((line, i) => {
    if (i > 0) nodes.push(<br key={`br-${i}`} />);
    nodes.push(...formatLine(line, i));
  });
  return nodes;
}

// One combined pattern so overlapping markers (e.g. `*a* _b_`) are
// matched left-to-right in a single pass instead of each formatter
// clobbering the others' output.
const TOKEN_RE = /```([^`\n]+)```|\*([^*\n]+)\*|_([^_\n]+)_|~([^~\n]+)~/g;

function formatLine(line: string, lineIndex: number): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(line.slice(lastIndex, match.index));
    }
    const [, mono, bold, italic, strike] = match;
    if (mono !== undefined) {
      nodes.push(
        <code key={`${lineIndex}-${key++}`} className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.9em] dark:bg-white/10">
          {mono}
        </code>,
      );
    } else if (bold !== undefined) {
      nodes.push(<strong key={`${lineIndex}-${key++}`}>{bold}</strong>);
    } else if (italic !== undefined) {
      nodes.push(<em key={`${lineIndex}-${key++}`}>{italic}</em>);
    } else if (strike !== undefined) {
      nodes.push(<s key={`${lineIndex}-${key++}`}>{strike}</s>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < line.length) {
    nodes.push(line.slice(lastIndex));
  }
  return nodes;
}
