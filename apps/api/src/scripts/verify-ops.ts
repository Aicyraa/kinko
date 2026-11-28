import { purgeExpiredTrash } from '../features/trash/trash.cleanup.ts';
import { cleanupExpiredUploads } from '../features/uploads/uploads.cleanup.ts';
import { prisma } from '../lib/prisma.ts';

async function main() {
	await prisma.$queryRaw`SELECT 1`;
	const [tenants, files, folders, shares, versions] = await Promise.all([
		prisma.tenant.count(),
		prisma.file.count(),
		prisma.folder.count(),
		prisma.fileShare.count(),
		prisma.fileVersion.count(),
	]);
	const [trashCleanup, uploadCleanup] = await Promise.all([
		purgeExpiredTrash(),
		cleanupExpiredUploads(),
	]);

	console.log(
		JSON.stringify(
			{
				ok: true,
				counts: { tenants, files, folders, shares, versions },
				trashCleanup,
				uploadCleanup,
			},
			null,
			2,
		),
	);
}

main()
	.catch((err) => {
		console.error('Ops verification failed:', err);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
