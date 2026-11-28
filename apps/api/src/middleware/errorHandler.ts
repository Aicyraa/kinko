import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { logger } from '../lib/logger.ts';
import type { ErrorCode } from '../types.ts';
import { errorResponse } from '../utils/response.ts';

export const errorHandler: ErrorHandler = (err, c) => {
	logger.error({ err, path: c.req.path }, 'error occurred in request');

	if (err instanceof ZodError) {
		const issues = err.issues.map((issue) => ({
			path: issue.path.join('.'),
			message: issue.message,
		}));
		return errorResponse(c, 'Validation failed', { issues }, 400);
	}

	if (err instanceof HTTPException) {
		const status = err.status;
		const code = (status >= 400 && status <= 504 ? status : 500) as ErrorCode;
		return errorResponse(c, err.message || 'Request failed', {}, code);
	}

	return errorResponse(c, 'Internal server error', {}, 500);
};
