import type { FastifyInstance } from "fastify";
import { locationRoutes } from "./locations.js";
import { ciderRoutes } from "./ciders.js";
import { entryRoutes } from "./entries.js";
import { reportRoutes } from "./reports.js";
import { lockRoutes } from "./locks.js";

export async function registerRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => ({ ok: true }));
  await app.register(locationRoutes, { prefix: "/api/locations" });
  await app.register(ciderRoutes, { prefix: "/api/ciders" });
  await app.register(entryRoutes, { prefix: "/api/entries" });
  await app.register(reportRoutes, { prefix: "/api/reports" });
  await app.register(lockRoutes, { prefix: "/api/locks" });
}
