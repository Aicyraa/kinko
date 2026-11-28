import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { ZodType } from 'zod';
import { errorResponse } from './response.ts';

/**
 * Wraps `@hono/zod-validator` so validation failures always return the
 * unified `{ success: false, message, code: 400, error }` envelope.
 */
export const validate = <
	Target extends keyof ValidationTargets,
	Schema extends ZodType,
>(
	target: Target,
	schema: Schema,
) =>
	zValidator(target, schema, (result, c) => {
		if (!result.success) {
			const issues = result.error.issues.map((issue) => ({
				path: issue.path.join('.'),
				message: issue.message,
			}));
			return errorResponse(c, 'Validation failed', { issues }, 400);
		}
	});
