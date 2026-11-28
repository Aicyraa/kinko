import { randomUUID } from 'node:crypto';
import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { reportError } from '../lib/monitoring.ts';
import type { AppEnv, ErrorCode } from '../types.ts';
import { errorResponse } from '../utils/response.ts';

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
	const errorId = randomUUID();
	c.header('X-Error-Id', errorId);

	let status = 500;
	if (err instanceof ZodError) {
		status = 400;
	} else if (err instanceof HTTPException) {
		status = err.status;
	}

	const tenant = c.get('tenant');
	const user = c.get('user');

	reportError(err, {
		errorId,
		path: c.req.path,
		method: c.req.method,
		status,
		tenantId: tenant?.id,
		userId: user?.id,
	});

	if (err instanceof ZodError) {
		const issues = err.issues.map((issue) => ({
			path: issue.path.join('.'),
			message: issue.message,
		}));
		return errorResponse(c, 'Validation failed', { issues, errorId }, 400);
	}

	if (err instanceof HTTPException) {
		const code = (status >= 400 && status <= 504 ? status : 500) as ErrorCode;
		return errorResponse(
			c,
			err.message || 'Request failed',
			{ errorId },
			code,
		);
	}

	return errorResponse(c, 'Internal server error', { errorId }, 500);
};
