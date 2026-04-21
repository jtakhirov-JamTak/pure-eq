// Minimal CSV serializer. RFC 4180 quoting: every cell wrapped in double
// quotes, internal " doubled. Newlines inside cells are preserved (quoted
// fields are allowed to contain them).

export type CsvCell = string | number | boolean | null | undefined;

export function serializeCsv(header: string[], rows: CsvCell[][]): string {
  const lines: string[] = [];
  lines.push(header.map(quote).join(","));
  for (const row of rows) {
    lines.push(row.map(toStringCell).map(quote).join(","));
  }
  // Trailing newline so append-friendly tools don't squash the last row.
  return lines.join("\n") + "\n";
}

function toStringCell(v: CsvCell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

function quote(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}
