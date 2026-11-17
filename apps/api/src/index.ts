import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { env } from "./env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { errorHandler } from "./middleware/error-handler.js";
import { requestLogger } from "./middleware/logger.js";
import { users } from "./routes/users.js";

const app = new Hono();

app.onError(errorHandler);
app.use("*", requestLogger);

app.get("/", (c) => c.json({ name: "kinko", status: "ok" }));
app.get("/health", (c) => c.json({ status: "ok" }));
app.route("/users", users);

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port }, `Server listening on http://localhost:${info.port}`);
});

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
