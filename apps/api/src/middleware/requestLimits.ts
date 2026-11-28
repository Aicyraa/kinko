import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types.ts';
import { errorResponse } from '../utils/response.ts';

export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024; // 1 MiB

export function enforceBodyLimit(maxBytes = DEFAULT_MAX_BODY_BYTES) {
	return createMiddleware<AppEnv>(async (c, next) => {
		const contentLengthHeader = c.req.header('content-length');
		if (contentLengthHeader) {
			const parsedLength = Number(contentLengthHeader);
			if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
				return errorResponse(
					c,
					'Request payload exceeds maximum allowed size',
					{ maxBytes },
					413,
				);
			}
		}

		const method = c.req.method.toUpperCase();
		if (
			!contentLengthHeader &&
			(method === 'POST' || method === 'PUT' || method === 'PATCH') &&
			c.req.raw.body
		) {
			const clone = c.req.raw.clone();
			const buf = await clone.arrayBuffer();
			if (buf.byteLength > maxBytes) {
				return errorResponse(
					c,
					'Request payload exceeds maximum allowed size',
					{ maxBytes },
					413,
				);
			}
		}

		await next();
	});
}
