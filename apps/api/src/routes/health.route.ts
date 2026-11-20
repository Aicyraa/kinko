import { Hono } from 'hono';
import { prisma } from '../lib/prisma.ts';

export const health = new Hono().get('/', async (c) => {
	const [date, time] = new Date().toISOString().split('T');

	try {
		const start = performance.now();

		await prisma.$queryRaw`SELECT 1`;
		const latency = `${Math.round(performance.now() - start) / 1000}ms`;

		return c.json({ status: 'healthy', latency, date, time, code: 200 });
	} catch (err) {
		return c.json(
			{
				status: 'unhealthy',
				error: err instanceof Error ? err.message : 'Unknown DB error',
				date,
				time,
				code: 500,
			},
			500,
		);
	}
});
