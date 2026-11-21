import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { logger } from '../lib/logger.ts';

export const errorHandler: ErrorHandler = (err, c) => {
	logger.error({ err }, 'error occured in request');
	if (err instanceof ZodError) {
		return c.json(
			{ status: 'validation failed', code: 400, issues: err.issues },
			400,
		);
	}

	if (err instanceof HTTPException) {
		return err.getResponse();
	}

	logger.error({ err }, 'unhandled error');
	return c.json({ status: 'internal server error', code: 500 }, 500);
};
