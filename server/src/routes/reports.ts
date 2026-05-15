import type { FastifyInstance } from "fastify";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db.js";

const querySchema = z.object({
  locationId: z.coerce.number().int(),
  year: z.coerce.number().int(),
  month: z.coerce.number().int().min(1).max(12),
});

const SIXTEL_GALLONS = 5.16;
const ML_PER_GALLON = 3785.411784;
const BOTTLE_GALLONS = 750 / ML_PER_GALLON;

export async function reportRoutes(app: FastifyInstance) {
  app.get("/monthly", async (req) => {
    const q = querySchema.parse(req.query);
    const prevYear = q.month === 1 ? q.year - 1 : q.year;
    const prevMonth = q.month === 1 ? 12 : q.month - 1;

    const [locationRows, entries, prevEntries] = await Promise.all([
      db.select().from(schema.locations).where(eq(schema.locations.id, q.locationId)),
      db.select().from(schema.monthlyEntries).where(
        and(
          eq(schema.monthlyEntries.locationId, q.locationId),
          eq(schema.monthlyEntries.year, q.year),
          eq(schema.monthlyEntries.month, q.month)
        )
      ),
      db.select().from(schema.monthlyEntries).where(
        and(
          eq(schema.monthlyEntries.locationId, q.locationId),
          eq(schema.monthlyEntries.year, prevYear),
          eq(schema.monthlyEntries.month, prevMonth)
        )
      ),
    ]);

    const location = locationRows[0] ?? null;

    // Fetch ciders for all entries
    const ciderIds = [...new Set(entries.map((e) => e.ciderId))];
    const ciderRows = ciderIds.length
      ? await db.select().from(schema.ciders).where(inArray(schema.ciders.id, ciderIds))
      : [];
    const cidersById = new Map(ciderRows.map((c) => [c.id, c]));
    const prevByCiderId = new Map(prevEntries.map((e) => [e.ciderId, e]));

    const byCategory: Record<string, CategorySummary> = {
      low: emptySummary(),
      sparkling: emptySummary(),
    };

    for (const e of entries) {
      const cider = cidersById.get(e.ciderId);
      if (!cider) continue;
      const bucket = byCategory[cider.category] ?? emptySummary();
      const prev = prevByCiderId.get(e.ciderId);
      bucket.startBottles += prev?.bottlesOnHand ?? 0;
      bucket.startKegs += prev?.kegsOnHand ?? 0;
      bucket.endBottles += e.bottlesOnHand;
      bucket.endKegs += e.kegsOnHand;
      bucket.togoBottles += e.togoBottles;
      bucket.togoKegs += e.togoKegs;
      bucket.retailBottles += e.retailBottles;
      bucket.retailKegs += e.retailKegs;
      bucket.transfersInBottles += e.transfersInBottles;
      bucket.transfersInKegs += e.transfersInKegs;
      bucket.transfersOutBottles += e.transfersOutBottles;
      bucket.transfersOutKegs += e.transfersOutKegs;
      byCategory[cider.category] = bucket;
    }

    for (const cat of Object.keys(byCategory)) {
      const b = byCategory[cat]!;
      b.startGallons = toGallons(b.startBottles, b.startKegs);
      b.endGallons = toGallons(b.endBottles, b.endKegs);
      b.togoGallons = toGallons(b.togoBottles, b.togoKegs);
      b.retailGallons = toGallons(b.retailBottles, b.retailKegs);
      b.transfersInGallons = toGallons(b.transfersInBottles, b.transfersInKegs);
      b.transfersOutGallons = toGallons(b.transfersOutBottles, b.transfersOutKegs);
    }

    return {
      location,
      year: q.year,
      month: q.month,
      conversions: { sixtelGallons: SIXTEL_GALLONS, bottleGallons: BOTTLE_GALLONS },
      categories: byCategory,
      rows: entries.map((e) => {
        const cider = cidersById.get(e.ciderId);
        const prev = prevByCiderId.get(e.ciderId);
        return {
          cider,
          startBottles: prev?.bottlesOnHand ?? 0,
          startKegs: prev?.kegsOnHand ?? 0,
          endBottles: e.bottlesOnHand,
          endKegs: e.kegsOnHand,
          togoBottles: e.togoBottles,
          togoKegs: e.togoKegs,
          retailBottles: e.retailBottles,
          retailKegs: e.retailKegs,
          transfersInBottles: e.transfersInBottles,
          transfersInKegs: e.transfersInKegs,
          transfersOutBottles: e.transfersOutBottles,
          transfersOutKegs: e.transfersOutKegs,
        };
      }),
    };
  });
}

type CategorySummary = {
  startBottles: number; startKegs: number;
  endBottles: number; endKegs: number;
  togoBottles: number; togoKegs: number;
  retailBottles: number; retailKegs: number;
  transfersInBottles: number; transfersInKegs: number;
  transfersOutBottles: number; transfersOutKegs: number;
  startGallons: number; endGallons: number;
  togoGallons: number; retailGallons: number;
  transfersInGallons: number; transfersOutGallons: number;
};

function emptySummary(): CategorySummary {
  return {
    startBottles: 0, startKegs: 0, endBottles: 0, endKegs: 0,
    togoBottles: 0, togoKegs: 0, retailBottles: 0, retailKegs: 0,
    transfersInBottles: 0, transfersInKegs: 0, transfersOutBottles: 0, transfersOutKegs: 0,
    startGallons: 0, endGallons: 0, togoGallons: 0, retailGallons: 0,
    transfersInGallons: 0, transfersOutGallons: 0,
  };
}

function toGallons(bottles: number, kegs: number): number {
  return Math.round((bottles * BOTTLE_GALLONS + kegs * SIXTEL_GALLONS) * 100) / 100;
}
