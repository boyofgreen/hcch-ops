/**
 * Seed script — imports locations/ciders and best-effort Jan-Mar 2026
 * data from CY26_Inventory_Cider_House_March.xlsx at repo root.
 */
import { and, eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { db, schema, runMigrations } from "./client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const XLSX_PATH = resolve(__dirname, "..", "CY26_Inventory_Cider_House_March.xlsx");

runMigrations(resolve(__dirname, "migrations"));

const LOCATIONS = [
  { name: "Cider House", slug: "cider-house", tabcLicense: null as string | null },
  { name: "Tasting Room", slug: "tasting-room", tabcLicense: null as string | null },
];

const SHEET_MAP: Record<string, { locationSlug: string; category: "low" | "sparkling" }> = {
  Low: { locationSlug: "cider-house", category: "low" },
  Sparkling: { locationSlug: "cider-house", category: "sparkling" },
  "TR Low": { locationSlug: "tasting-room", category: "low" },
  "TR Sparkling": { locationSlug: "tasting-room", category: "sparkling" },
};

const NAME_ALIASES: Record<string, string> = {
  "Endless Mellon": "Endless Melon",
  "Endless mellon": "Endless Melon",
  "Naught and Spice": "Naughty and Spice",
  "N&S keg": "Naughty and Spice (Keg)",
  "N&S Keg": "Naughty and Spice (Keg)",
  "Tis The Season Keg": "TIS The Season (Keg)",
  "TTS keg": "TIS The Season (Keg)",
  "Sugar plum Fairy": "Sugar Plum Fairy",
};

// Row names that are section footers/labels, not cider names
const SKIP_NAMES = new Set(["ending", "beginning", "total", "totals"]);

function canonical(name: string): string {
  const stripped = name.replace(/ /g, " ").trim();
  const lc = stripped.toLowerCase();
  for (const [k, v] of Object.entries(NAME_ALIASES)) {
    if (k.toLowerCase() === lc) return v;
  }
  return stripped;
}

const MONTH_HEADERS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

type SectionKind = "inventory_bottles" | "inventory_kegs" | "togo" | "retail" | "transfer";

function detectSection(label: string): SectionKind | null {
  const l = label.toLowerCase();
  if (l.includes("inventory") && l.includes("keg")) return "inventory_kegs";
  if (l.includes("inventory") || l.includes("end inventory")) return "inventory_bottles";
  if (l.includes("to go") || l.includes("to-go") || l.includes("togo")) return "togo";
  if (l.includes("retail")) return "retail";
  if (l.includes("transfer")) return "transfer";
  return null;
}

type ParsedRow = { ciderName: string; isKeg: boolean; byMonth: Map<number, number> };
type ParsedSection = { kind: SectionKind; rows: ParsedRow[] };

function parseSheet(sheet: XLSX.WorkSheet): ParsedSection[] {
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1, defval: null, blankrows: false,
  }) as (string | number | null)[][];

  const sections: ParsedSection[] = [];
  let i = 0;
  while (i < grid.length) {
    const first = typeof grid[i]?.[0] === "string" ? (grid[i]![0] as string) : null;
    const kind = first ? detectSection(first) : null;
    if (!kind) { i++; continue; }

    let headerIdx = i + 1;
    while (headerIdx < grid.length && !grid[headerIdx]?.[0]) headerIdx++;
    const headerRow = grid[headerIdx] ?? [];
    const monthCols: { col: number; month: number }[] = [];
    for (let c = 1; c < headerRow.length; c++) {
      const cell = headerRow[c];
      if (typeof cell === "string") {
        const m = MONTH_HEADERS[cell.trim().toLowerCase()];
        if (m) monthCols.push({ col: c, month: m });
      }
    }

    const rows: ParsedRow[] = [];
    let r = headerIdx + 1;
    for (; r < grid.length; r++) {
      const name = typeof grid[r]?.[0] === "string" ? (grid[r]![0] as string) : null;
      if (!name) break;
      const lower = name.toLowerCase().trim();
      if (SKIP_NAMES.has(lower)) break;
      if (detectSection(name)) break;
      const byMonth = new Map<number, number>();
      for (const { col, month } of monthCols) {
        const v = grid[r]?.[col];
        if (typeof v === "number" && Number.isFinite(v)) byMonth.set(month, Math.round(v));
      }
      rows.push({ ciderName: canonical(name), isKeg: /\bkeg/i.test(name), byMonth });
    }
    sections.push({ kind, rows });
    i = r;
  }
  return sections;
}

type EntryKey =
  | "bottlesOnHand" | "kegsOnHand" | "togoBottles" | "togoKegs"
  | "retailBottles" | "retailKegs" | "transfersInBottles" | "transfersInKegs"
  | "transfersOutBottles" | "transfersOutKegs";

async function main() {
  console.log("Seeding from", XLSX_PATH);
  const buf = readFileSync(XLSX_PATH);
  const wb = XLSX.read(buf, { type: "buffer" });

  const locationRows = await Promise.all(
    LOCATIONS.map(async (loc) => {
      const rows = await db.select().from(schema.locations).where(eq(schema.locations.slug, loc.slug));
      if (rows[0]) return rows[0];
      const ins = await db.insert(schema.locations).values(loc).returning();
      return ins[0]!;
    })
  );
  const locBySlug = new Map(locationRows.map((l) => [l.slug, l]));

  const ciderCatalog = new Map<string, "low" | "sparkling">();
  for (const [sheetName, info] of Object.entries(SHEET_MAP)) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    for (const s of parseSheet(sheet)) {
      for (const r of s.rows) {
        if (!ciderCatalog.has(r.ciderName)) ciderCatalog.set(r.ciderName, info.category);
      }
    }
  }

  const ciderByName = new Map<string, typeof schema.ciders.$inferSelect>();
  for (const [name, category] of ciderCatalog) {
    const rows = await db.select().from(schema.ciders).where(eq(schema.ciders.name, name));
    if (rows[0]) { ciderByName.set(name, rows[0]); continue; }
    const ins = await db.insert(schema.ciders).values({ name, category, active: true }).returning();
    ciderByName.set(name, ins[0]!);
  }

  const accum = new Map<string, Partial<Record<EntryKey, number>>>();
  const keyFor = (locId: number, ciderId: number, month: number) => `${locId}|${ciderId}|${month}`;
  const add = (key: string, field: EntryKey, value: number) => {
    const cur = accum.get(key) ?? {};
    cur[field] = (cur[field] ?? 0) + value;
    accum.set(key, cur);
  };

  for (const [sheetName, info] of Object.entries(SHEET_MAP)) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const loc = locBySlug.get(info.locationSlug)!;
    const isTR = info.locationSlug === "tasting-room";
    for (const section of parseSheet(sheet)) {
      for (const r of section.rows) {
        const cider = ciderByName.get(r.ciderName);
        if (!cider) continue;
        for (const [month, value] of r.byMonth) {
          if (month < 1 || month > 3) continue;
          const k = keyFor(loc.id, cider.id, month);
          switch (section.kind) {
            case "inventory_bottles": add(k, r.isKeg ? "kegsOnHand" : "bottlesOnHand", value); break;
            case "inventory_kegs": add(k, "kegsOnHand", value); break;
            case "togo": add(k, r.isKeg ? "togoKegs" : "togoBottles", value); break;
            case "retail": add(k, r.isKeg ? "retailKegs" : "retailBottles", value); break;
            case "transfer":
              if (isTR) add(k, r.isKeg ? "transfersInKegs" : "transfersInBottles", value);
              else add(k, r.isKeg ? "transfersOutKegs" : "transfersOutBottles", value);
              break;
          }
        }
      }
    }
  }

  const now = new Date().toISOString();
  let written = 0;
  for (const [key, data] of accum) {
    const [locStr, ciderStr, monthStr] = key.split("|");
    const locationId = Number(locStr), ciderId = Number(ciderStr), month = Number(monthStr);
    const existing = await db
      .select()
      .from(schema.monthlyEntries)
      .where(
        and(
          eq(schema.monthlyEntries.locationId, locationId),
          eq(schema.monthlyEntries.ciderId, ciderId),
          eq(schema.monthlyEntries.year, 2026),
          eq(schema.monthlyEntries.month, month)
        )
      );
    if (existing[0]) {
      await db.update(schema.monthlyEntries)
        .set({ ...data, updatedAt: now })
        .where(eq(schema.monthlyEntries.id, existing[0].id));
    } else {
      await db.insert(schema.monthlyEntries)
        .values({ locationId, ciderId, year: 2026, month, ...data, updatedAt: now });
    }
    written++;
  }

  console.log(`Done. Locations: ${locationRows.length}, Ciders: ${ciderByName.size}, Entries: ${written}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
