const MARKDOWN_BLOCK_START = /^(?:#{1,6}\s|>\s?|[-*+]\s+|\d+\.\s+|```|(?:-{3,}|\*{3,}|_{3,})\s*$)/;

const EMOJI_SHORTCODES: Record<string, string> = {
  warning: "⚠️",
  loudspeaker: "📢",
  megaphone: "📣",
  fire: "🔥",
  rocket: "🚀",
  sparkles: "✨",
  bulb: "💡",
  info: "ℹ️",
  point_right: "👉",
  point_left: "👈",
  point_up: "👆",
  point_down: "👇",
  white_check_mark: "✅",
  check: "✅",
  x: "❌",
  cross_mark: "❌",
  lock: "🔒",
  unlock: "🔓",
  key: "🔑",
  memo: "📝",
  pencil: "✏️",
  eyes: "👀",
  hourglass: "⏳",
  boom: "💥",
  heart: "❤️",
  star: "⭐",
  tada: "🎉",
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "#";
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:") {
      return parsed.toString();
    }
  } catch {
    return "#";
  }

  return "#";
}

function preserveHtml(store: string[], html: string) {
  const token = `@@MARKDOWN_HTML_${store.length}@@`;
  store.push(html);
  return token;
}

function renderInlineMarkdown(text: string) {
  const preserved: string[] = [];

  let rendered = text.replace(/`([^`]+)`/g, (_match, code) =>
    preserveHtml(preserved, `<code>${escapeHtml(code)}</code>`)
  );

  rendered = escapeHtml(rendered);

  rendered = rendered.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label, url) =>
    preserveHtml(
      preserved,
      `<a href="${sanitizeUrl(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`
    )
  );

  rendered = rendered.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  rendered = rendered.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  rendered = rendered.replace(/(^|[\s(])\*([^*]+)\*(?=$|[\s).,!?:;])/g, "$1<em>$2</em>");
  rendered = rendered.replace(/(^|[\s(])_([^_]+)_(?=$|[\s).,!?:;])/g, "$1<em>$2</em>");
  rendered = rendered.replace(/:([a-z0-9_+-]+):/gi, (match, shortcode) => {
    return EMOJI_SHORTCODES[String(shortcode).toLowerCase()] || match;
  });

  return rendered.replace(/@@MARKDOWN_HTML_(\d+)@@/g, (_match, index) => preserved[Number(index)] || "");
}

function renderParagraph(lines: string[]) {
  return `<p>${lines.map((line) => renderInlineMarkdown(line.trim())).join("<br />")}</p>`;
}

function isOrderedListItem(value: string) {
  return /^\d+\.\s+/.test(value);
}

function isUnorderedListItem(value: string) {
  return /^[-*+]\s+/.test(value);
}

function isHorizontalRule(value: string) {
  return /^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(value);
}

export function renderMarkdownToHtml(markdown: string, emptyLabel = "当前暂无说明内容。") {
  const normalized = markdown.replace(/\r\n?/g, "\n").trim();
  if (!normalized) {
    return `<p>${escapeHtml(emptyLabel)}</p>`;
  }

  const lines = normalized.split("\n");
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const currentLine = lines[index] ?? "";
    const trimmed = currentLine.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      const className = language ? ` class="language-${language}"` : "";
      blocks.push(`<pre><code${className}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    if (/^#{1,6}\s/.test(trimmed)) {
      const level = trimmed.match(/^#+/)?.[0].length ?? 1;
      const safeLevel = Math.min(6, Math.max(1, level));
      const content = trimmed.slice(safeLevel).trim();
      blocks.push(`<h${safeLevel}>${renderInlineMarkdown(content)}</h${safeLevel}>`);
      index += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];

      while (index < lines.length) {
        const quoteCandidate = lines[index].trim();
        if (!quoteCandidate.startsWith(">")) {
          break;
        }
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }

      blocks.push(`<blockquote>${renderMarkdownToHtml(quoteLines.join("\n"), emptyLabel)}</blockquote>`);
      continue;
    }

    if (isHorizontalRule(trimmed)) {
      blocks.push("<hr />");
      index += 1;
      continue;
    }

    if (isUnorderedListItem(trimmed)) {
      const items: string[] = [];

      while (index < lines.length && isUnorderedListItem(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*+]\s+/, ""));
        index += 1;
      }

      blocks.push(`<ul>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ul>`);
      continue;
    }

    if (isOrderedListItem(trimmed)) {
      const items: string[] = [];

      while (index < lines.length && isOrderedListItem(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }

      blocks.push(`<ol>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ol>`);
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const paragraphCandidate = lines[index].trim();
      if (!paragraphCandidate) {
        index += 1;
        break;
      }
      if (MARKDOWN_BLOCK_START.test(paragraphCandidate) && paragraphLines.length > 0) {
        break;
      }
      paragraphLines.push(lines[index]);
      index += 1;
    }

    blocks.push(renderParagraph(paragraphLines));
  }

  return blocks.join("\n");
}
