import { serve } from '@hono/node-server';
import { app } from './app.ts';
import { env } from './env.ts';
import { purgeExpiredTrash } from './features/trash/trash.cleanup.ts';
import { logger } from './lib/logger.ts';
import { prisma } from './lib/prisma.ts';

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

if (!process.env.VERCEL) {
	const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
		logger.info(
			{ port: info.port },
			`Server listening on http://localhost:${info.port}`,
		);
	});

	const cleanupTimer = setInterval(() => {
		void purgeExpiredTrash().catch((err) => {
			logger.error({ err }, 'scheduled trash cleanup failed');
		});
	}, CLEANUP_INTERVAL_MS);
	cleanupTimer.unref();

	async function shutdown(signal: string) {
		logger.info({ signal }, 'shutting down');
		clearInterval(cleanupTimer);
		server.close();
		await prisma.$disconnect();
		process.exit(0);
	}

	process.on('SIGINT', () => void shutdown('SIGINT'));
	process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

export default app;
