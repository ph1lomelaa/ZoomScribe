export function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // headings (strip leading emoji from heading text)
  const stripLeadingEmoji = (s: string) =>
    s.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s*/u, "").trim();

  html = html.replace(/^# (.+)$/gm, (_, t) => `<h1 class="md-h1">${stripLeadingEmoji(t)}</h1>`);
  html = html.replace(/^## (.+)$/gm, (_, t) => `<h2 class="md-h2">${stripLeadingEmoji(t)}</h2>`);
  html = html.replace(/^### (.+)$/gm, (_, t) => `<h3 class="md-h3">${stripLeadingEmoji(t)}</h3>`);

  // bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // task lists
  html = html.replace(
    /^- \[x\] (.+)$/gim,
    '<li class="md-task md-task-done"><span class="md-task-box">✓</span><span>$1</span></li>'
  );
  html = html.replace(
    /^- \[ \] (.+)$/gm,
    '<li class="md-task"><span class="md-task-box"></span><span>$1</span></li>'
  );

  // bullet lists
  html = html.replace(/^- (.+)$/gm, '<li class="md-li">$1</li>');
  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul class="md-ul">$&</ul>');

  // paragraphs (double newline → paragraph)
  html = html
    .split(/\n{2,}/)
    .map((block) => {
      if (
        block.startsWith("<h") ||
        block.startsWith("<ul") ||
        block.startsWith("<li")
      ) {
        return block;
      }
      const trimmed = block.trim();
      if (!trimmed) return "";
      return `<p class="md-p">${trimmed.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("\n");

  return html;
}
