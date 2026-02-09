export function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitIntoChapters(rawText: string): Array<{ title: string; text: string }> {
  const normalized = rawText.replace(/\r\n/g, "\n").trim();
  const chapterRegex = /(^|\n)(chapter\s+\d+[^\n]*)/gi;
  const matches = Array.from(normalized.matchAll(chapterRegex));

  if (matches.length === 0) {
    return [{ title: "Chapter 1", text: normalized }];
  }

  const chapters: Array<{ title: string; text: string }> = [];

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    if (!match) {
      continue;
    }
    const title = match[2]?.trim() ?? `Chapter ${i + 1}`;
    const start = (match.index ?? 0) + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1]?.index ?? normalized.length : normalized.length;
    const text = normalized.slice(start, end).trim();
    chapters.push({ title, text: text || "(empty chapter)" });
  }

  return chapters;
}

export function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"'\[])|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}
