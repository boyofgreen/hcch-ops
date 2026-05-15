import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db.js";

const bodySchema = z.object({
  locationId: z.number().int(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
});

export async function lockRoutes(app: FastifyInstance) {
  // GET /api/locks?locationId=&year=&month=  → { locked: boolean, lockedAt?: string }
  app.get("/", async (req) => {
    const q = z.object({
      locationId: z.coerce.number().int(),
      year: z.coerce.number().int(),
      month: z.coerce.number().int(),
    }).parse(req.query);

    const rows = await db
      .select()
      .from(schema.monthlyLocks)
      .where(
        and(
          eq(schema.monthlyLocks.locationId, q.locationId),
          eq(schema.monthlyLocks.year, q.year),
          eq(schema.monthlyLocks.month, q.month)
        )
      );

    return rows[0]
      ? { locked: true,  lockedAt: rows[0].lockedAt }
      : { locked: false, lockedAt: null };
  });

  // PUT /api/locks  → lock a month
  app.put("/", async (req, reply) => {
    const { locationId, year, month } = bodySchema.parse(req.body);
    const now = new Date().toISOString();

    const existing = await db
      .select()
      .from(schema.monthlyLocks)
      .where(
        and(
          eq(schema.monthlyLocks.locationId, locationId),
          eq(schema.monthlyLocks.year, year),
          eq(schema.monthlyLocks.month, month)
        )
      );

    if (!existing[0]) {
      await db.insert(schema.monthlyLocks).values({ locationId, year, month, lockedAt: now });
    }
    reply.code(200).send({ locked: true, lockedAt: now });
  });

  // DELETE /api/locks  → unlock a month
  app.delete("/", async (req, reply) => {
    const { locationId, year, month } = bodySchema.parse(req.body);

    await db
      .delete(schema.monthlyLocks)
      .where(
        and(
          eq(schema.monthlyLocks.locationId, locationId),
          eq(schema.monthlyLocks.year, year),
          eq(schema.monthlyLocks.month, month)
        )
      );

    reply.code(200).send({ locked: false, lockedAt: null });
  });
}
