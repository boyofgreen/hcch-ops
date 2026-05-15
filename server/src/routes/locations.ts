import type { FastifyInstance } from "fastify";
import { asc } from "drizzle-orm";
import { db, schema } from "../db.js";

export async function locationRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    return db.select().from(schema.locations).orderBy(asc(schema.locations.id));
  });
}
