// Returns the canonical value accepted by the daily review time columns.
export function normalizeRecordedTime(input: string): string | null {
  const trimmed = input.trim();
  const candidate = /^\d{3,4}$/.test(trimmed)
    ? `${trimmed.slice(0, -2)}:${trimmed.slice(-2)}`
    : trimmed;
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(candidate);
  if (!match || Number(match[1]) > 23) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}
