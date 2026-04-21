// Post-process a review_packet.csv into human-readable forms.
// - review_packet.md: one section per entry, 6 blind outputs side-by-side,
//   plain markdown (ideal for on-screen reading before scoring).
// - review_packet_flat.csv: same columns as review_packet.csv but with newlines
//   inside source_context and normalized_output replaced by "  ·  " so every
//   row renders as a single visual line in Excel / Sheets without wrap-text.
//
// Run: npx tsx scripts/eval/format-packet.ts <path-to-batch-dir>

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function parseCsv(s: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  let cur = "";
  let row: string[] = [];
  let inQuote = false;
  while (i < s.length) {
    const c = s[i];
    if (inQuote) {
      if (c === '"' && s[i + 1] === '"') {
        cur += '"';
        i += 2;
        continue;
      }
      if (c === '"') {
        inQuote = false;
        i++;
        continue;
      }
      cur += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuote = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(cur);
      cur = "";
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

function csvQuote(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

async function main() {
  const batchDir = process.argv[2];
  if (!batchDir) {
    console.error("usage: tsx scripts/eval/format-packet.ts <batch-dir>");
    process.exit(1);
  }
  const packetPath = path.join(batchDir, "review_packet.csv");
  const src = await readFile(packetPath, "utf8");
  const rows = parseCsv(src);
  const header = rows[0];
  const data = rows.slice(1).filter((r) => r.length >= header.length);

  // ---- Markdown output ----
  const byEntry = new Map<string, string[][]>();
  for (const r of data) {
    const key = `${r[1]}::${r[0]}`;
    if (!byEntry.has(key)) byEntry.set(key, []);
    byEntry.get(key)!.push(r);
  }
  const mdLines: string[] = [];
  mdLines.push("# Blind review packet");
  mdLines.push("");
  mdLines.push(
    "Scoring rubric per blind output: specificity, correctness of read, usefulness of next move, phrase-level quality, overall preference (all 1–5), would_ship (yes/no), major_issue_note.",
  );
  mdLines.push("");
  let entryNum = 0;
  for (const [key, slots] of byEntry) {
    entryNum++;
    const [module, entryId] = key.split("::");
    const sourceContext = slots[0][3];
    mdLines.push(`## Entry ${entryNum} — module: ${module}`);
    mdLines.push("");
    mdLines.push(`Entry id: \`${entryId}\``);
    mdLines.push("");
    mdLines.push("### Source context");
    mdLines.push("");
    mdLines.push("```");
    mdLines.push(sourceContext);
    mdLines.push("```");
    mdLines.push("");
    for (const r of slots) {
      mdLines.push(`### Blind label ${r[2]}`);
      mdLines.push("");
      mdLines.push("```");
      mdLines.push(r[4]);
      mdLines.push("```");
      mdLines.push("");
    }
    mdLines.push("---");
    mdLines.push("");
  }
  const mdPath = path.join(batchDir, "review_packet.md");
  await writeFile(mdPath, mdLines.join("\n"), "utf8");

  // ---- Flat CSV output ----
  const sep = "  ·  ";
  const flatRows: string[][] = [header];
  for (const r of data) {
    const copy = [...r];
    copy[3] = (copy[3] ?? "").replace(/\r?\n/g, sep);
    copy[4] = (copy[4] ?? "").replace(/\r?\n/g, sep);
    flatRows.push(copy);
  }
  const flatCsv =
    flatRows.map((row) => row.map(csvQuote).join(",")).join("\n") + "\n";
  const flatPath = path.join(batchDir, "review_packet_flat.csv");
  await writeFile(flatPath, flatCsv, "utf8");

  console.log(`wrote: ${mdPath}`);
  console.log(`wrote: ${flatPath}`);
}

main().catch((err) => {
  console.error("format-packet fatal:", err);
  process.exit(1);
});
