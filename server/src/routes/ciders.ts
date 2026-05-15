import type { FastifyInstance } from "fastify";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db.js";


const upsertSchema = z.object({
  name: z.string().min(1),
  category: z.enum(["low", "sparkling"]),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function ciderRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    return db
      .select()
      .from(schema.ciders)
      .orderBy(asc(schema.ciders.category), asc(schema.ciders.sortOrder), asc(schema.ciders.name));
  });

  app.post("/", async (req, reply) => {
    const body = upsertSchema.parse(req.body);
    const [row] = await db.insert(schema.ciders).values(body).returning();
    reply.code(201).send(row);
  });

  app.patch("/:id", async (req) => {
    const id = Number((req.params as { id: string }).id);
    const body = upsertSchema.partial().parse(req.body);
    const [row] = await db
      .update(schema.ciders)
      .set(body)
      .where(eq(schema.ciders.id, id))
      .returning();
    return row;
  });

  app.delete("/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    await db.delete(schema.ciders).where(eq(schema.ciders.id, id));
    reply.code(204).send();
  });
}
