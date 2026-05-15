import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { runMigrations } from "./db.js";
import { registerRoutes } from "./routes/index.js";

const PORT = Number(process.env.PORT ?? 8080);
const projectRoot = process.cwd();

runMigrations(resolve(projectRoot, "db/migrations"));

const app = Fastify({ logger: true });

await registerRoutes(app);

const webDist = resolve(projectRoot, "web/dist");
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api/")) {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    reply.sendFile("index.html");
  });
}

app.listen({ port: PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
