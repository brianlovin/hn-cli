export const LOADING_CHARS = [
  "\u280B",
  "\u2819",
  "\u2839",
  "\u2838",
  "\u283C",
  "\u2834",
  "\u2826",
  "\u2827",
  "\u2807",
  "\u280F",
];

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}

export function stripHtml(html: string): string {
  return (
    html
      // Handle paragraphs - add double newline between them
      .replace(/<\/p>\s*<p>/g, "\n\n")
      .replace(/<p>/g, "")
      .replace(/<\/p>/g, "\n\n")
      .replace(/<br\s*\/?>/g, "\n")
      .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g, "$2 ($1)")
      .replace(/<code>/g, "`")
      .replace(/<\/code>/g, "`")
      .replace(/<pre>/g, "\n```\n")
      .replace(/<\/pre>/g, "\n```\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, "/")
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      // Normalize multiple newlines to max 2
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
