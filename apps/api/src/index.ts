import { serve } from '@hono/node-server';
import { app } from './app.ts';
import { env } from './env.ts';
import { logger } from './lib/logger.ts';
import { prisma } from './lib/prisma.ts';

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
	logger.info(
		{ port: info.port },
		`Server listening on http://localhost:${info.port}`,
	);
});

async function shutdown(signal: string) {
	logger.info({ signal }, 'shutting down');
	server.close();
	await prisma.$disconnect();
	process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
