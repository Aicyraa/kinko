import { PrismaNeon } from '@prisma/adapter-neon';
import { env } from '../env.js';
import { PrismaClient } from '../generated/prisma/client.js';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
	// Pooled Neon connection for runtime queries. Migrations/Studio use DIRECT_URL
	// via prisma7.config.ts instead.
	const adapter = new PrismaNeon({ connectionString: env.DATABASE_URL });

	return new PrismaClient({
		adapter,
		log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
	});
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== 'production') {
	globalForPrisma.prisma = prisma;
}
