import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { logger } from '../lib/logger.js';

export const errorHandler: ErrorHandler = (err, c) => {
	if (err instanceof ZodError) {
		return c.json({ error: 'Validation failed', issues: err.issues }, 400);
	}

	if (err instanceof HTTPException) {
		return err.getResponse();
	}

	logger.error({ err }, 'unhandled error');
	return c.json({ error: 'Internal server error' }, 500);
};
