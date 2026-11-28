import { env } from '../../env.ts';
import { logger } from '../../lib/logger.ts';
import { prisma } from '../../lib/prisma.ts';
import {
	permanentlyDeleteFileRecord,
	permanentlyDeleteFolderRecord,
} from './trash.service.ts';

export async function purgeExpiredTrash(options?: {
	retentionDays?: number;
	tenantId?: string;
}): Promise<{
	purgedFiles: number;
	purgedFolders: number;
	freedBytes: number;
}> {
	const retentionDays = options?.retentionDays ?? env.TRASH_RETENTION_DAYS;
	const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
	const tenantFilter = options?.tenantId ? { tenantId: options.tenantId } : {};

	let purgedFiles = 0;
	let purgedFolders = 0;
	let freedBytes = 0;

	// 1. Purge expired soft-deleted files first
	const expiredFiles = await prisma.file.findMany({
		where: {
			...tenantFilter,
			deletedAt: { not: null, lte: cutoff },
		},
		select: { id: true, tenantId: true },
	});

	for (const file of expiredFiles) {
		try {
			const res = await permanentlyDeleteFileRecord(
				file.tenantId,
				null,
				file.id,
			);
			purgedFiles += res.deletedFiles;
			freedBytes += res.freedBytes;
		} catch (err) {
			logger.error(
				{ err, fileId: file.id, tenantId: file.tenantId },
				'failed to purge expired file from trash',
			);
		}
	}

	// 2. Purge expired soft-deleted folders (re-check existence since parent cascade may remove children)
	const expiredFolders = await prisma.folder.findMany({
		where: {
			...tenantFilter,
			deletedAt: { not: null, lte: cutoff },
		},
		select: { id: true, tenantId: true },
		orderBy: { deletedAt: 'asc' },
	});

	for (const folder of expiredFolders) {
		const stillExists = await prisma.folder.findUnique({
			where: { id: folder.id },
			select: { id: true },
		});
		if (!stillExists) continue;

		try {
			const res = await permanentlyDeleteFolderRecord(
				folder.tenantId,
				null,
				folder.id,
			);
			purgedFolders += res.deletedFolders;
			purgedFiles += res.deletedFiles;
			freedBytes += res.freedBytes;
		} catch (err) {
			logger.error(
				{ err, folderId: folder.id, tenantId: folder.tenantId },
				'failed to purge expired folder from trash',
			);
		}
	}

	logger.info(
		{
			purgedFiles,
			purgedFolders,
			freedBytes,
			retentionDays,
			cutoff: cutoff.toISOString(),
		},
		'expired trash cleanup completed',
	);

	return { purgedFiles, purgedFolders, freedBytes };
}
