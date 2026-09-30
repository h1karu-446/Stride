/** Existing free text is read as one bullet per line without rewriting storage. */
export function parseVision(value: string | undefined): string[] {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
}

/** Store one item per line; the UI provides the bullet marker. */
export function serializeVision(items: string[]): string {
  return items.map((item) => item.trim()).filter(Boolean).join("\n");
}
