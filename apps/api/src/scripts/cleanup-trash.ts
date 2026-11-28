import { purgeExpiredTrash } from '../features/trash/trash.cleanup.ts';
import { prisma } from '../lib/prisma.ts';

async function main() {
	const result = await purgeExpiredTrash();
	console.log('Trash cleanup summary:', result);
}

main()
	.catch((err) => {
		console.error('Trash cleanup failed:', err);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
