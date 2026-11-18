import { Hono } from "hono";
import { contextStorage } from "hono/context-storage";
import { requestLogger } from "./middleware/logger.ts";
import { health } from "./routes/health.route.ts";
import { errorHandler } from "./middleware/error-handler.ts";
import { notFound } from "./middleware/not-found.ts";

export const app = new Hono().basePath('/api/v1')

app.use('*', contextStorage())
app.use('*', requestLogger)

app.onError(errorHandler)
app.notFound(notFound)

app.route('/health', health)