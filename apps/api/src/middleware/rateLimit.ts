import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types.ts';
import { errorResponse } from '../utils/response.ts';

interface RateBucket {
	count: number;
	resetAt: number;
}

const store = new Map<string, RateBucket>();
const MAX_BUCKETS_BEFORE_PRUNE = 1000;

export function resetRateLimiters(): void {
	store.clear();
}

function pruneExpired(now: number): void {
	if (store.size <= MAX_BUCKETS_BEFORE_PRUNE) return;
	for (const [key, bucket] of store.entries()) {
		if (bucket.resetAt <= now) {
			store.delete(key);
		}
	}
}

export function createRateLimiter(options: {
	windowMs: number;
	maxRequests: number;
	keyPrefix: string;
}) {
	return createMiddleware<AppEnv>(async (c, next) => {
		const now = Date.now();
		pruneExpired(now);

		const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
		const realIp = c.req.header('x-real-ip')?.trim();
		const ip = forwarded || realIp || 'local';
		const user = c.get('user');
		const key = `${options.keyPrefix}:${user?.id ?? ip}`;

		let bucket = store.get(key);
		if (!bucket || bucket.resetAt <= now) {
			bucket = { count: 0, resetAt: now + options.windowMs };
			store.set(key, bucket);
		}

		bucket.count += 1;
		const remaining = Math.max(0, options.maxRequests - bucket.count);
		const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

		c.header('X-RateLimit-Limit', String(options.maxRequests));
		c.header('X-RateLimit-Remaining', String(remaining));
		c.header('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

		if (bucket.count > options.maxRequests) {
			c.header('Retry-After', String(resetSeconds));
			return errorResponse(
				c,
				'Too many requests; please try again later',
				{ retryAfterSeconds: resetSeconds },
				429,
			);
		}

		await next();
	});
}
