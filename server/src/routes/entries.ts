import type { FastifyInstance } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db.js";

async function isLocked(locationId: number, year: number, month: number): Promise<boolean> {
  const rows = await db.select().from(schema.monthlyLocks).where(
    and(
      eq(schema.monthlyLocks.locationId, locationId),
      eq(schema.monthlyLocks.year, year),
      eq(schema.monthlyLocks.month, month)
    )
  );
  return rows.length > 0;
}

const querySchema = z.object({
  locationId: z.coerce.number().int(),
  year: z.coerce.number().int(),
  month: z.coerce.number().int().min(1).max(12),
});

const intField = z.coerce.number().int().min(0);

const upsertSchema = z.object({
  locationId: z.number().int(),
  ciderId: z.number().int(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  bottlesOnHand: intField.optional(),
  kegsOnHand: intField.optional(),
  togoBottles: intField.optional(),
  togoKegs: intField.optional(),
  retailBottles: intField.optional(),
  retailKegs: intField.optional(),
  transfersInBottles: intField.optional(),
  transfersInKegs: intField.optional(),
  transfersOutBottles: intField.optional(),
  transfersOutKegs: intField.optional(),
  notes: z.string().nullable().optional(),
});

export async function entryRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const q = querySchema.parse(req.query);

    const [ciders, entries] = await Promise.all([
      db.select().from(schema.ciders)
        .where(eq(schema.ciders.active, true))
        .orderBy(asc(schema.ciders.category), asc(schema.ciders.sortOrder), asc(schema.ciders.name)),
      db.select().from(schema.monthlyEntries).where(
        and(
          eq(schema.monthlyEntries.locationId, q.locationId),
          eq(schema.monthlyEntries.year, q.year),
          eq(schema.monthlyEntries.month, q.month)
        )
      ),
    ]);

    const byCiderId = new Map(entries.map((e) => [e.ciderId, e]));
    return ciders.map((c) => ({ cider: c, entry: byCiderId.get(c.id) ?? null }));
  });

  app.put("/", async (req, reply) => {
    const body = upsertSchema.parse(req.body);
    const { locationId, ciderId, year, month, notes, ...rest } = body;

    if (await isLocked(locationId, year, month)) {
      return reply.code(423).send({ error: "This month is locked. Unlock it before making changes." });
    }
    const data = { ...rest, notes: notes ?? null };
    const now = new Date().toISOString();

    const existing = await db.select().from(schema.monthlyEntries).where(
      and(
        eq(schema.monthlyEntries.locationId, locationId),
        eq(schema.monthlyEntries.ciderId, ciderId),
        eq(schema.monthlyEntries.year, year),
        eq(schema.monthlyEntries.month, month)
      )
    );

    if (existing[0]) {
      const [row] = await db
        .update(schema.monthlyEntries)
        .set({ ...data, updatedAt: now })
        .where(eq(schema.monthlyEntries.id, existing[0].id))
        .returning();
      return row;
    }
    const [row] = await db
      .insert(schema.monthlyEntries)
      .values({ locationId, ciderId, year, month, ...data, updatedAt: now })
      .returning();
    return row;
  });
}
