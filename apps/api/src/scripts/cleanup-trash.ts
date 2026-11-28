import { purgeExpiredTrash } from '../features/trash/trash.cleanup.ts';
import { cleanupExpiredUploads } from '../features/uploads/uploads.cleanup.ts';
import { prisma } from '../lib/prisma.ts';

async function main() {
	const [trashResult, uploadResult] = await Promise.all([
		purgeExpiredTrash(),
		cleanupExpiredUploads(),
	]);
	console.log('Cleanup summary:', { trashResult, uploadResult });
}

main()
	.catch((err) => {
		console.error('Cleanup failed:', err);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
