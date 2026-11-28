import { HTTPException } from 'hono/http-exception';
import { prisma } from '../../lib/prisma.ts';
import { createPresignedDownloadUrl } from '../../lib/storage.ts';
import { type FileDTO, serializeFile } from '../../utils/serialize.ts';

export async function listFiles(
	tenantId: string,
	options: {
		folderId?: string;
		page: number;
		limit: number;
		sortBy: 'name' | 'sizeBytes' | 'createdAt' | 'updatedAt';
		sortOrder: 'asc' | 'desc';
	},
): Promise<{
	items: FileDTO[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
}> {
	const folderFilter =
		options.folderId === undefined
			? {}
			: { folderId: options.folderId === 'root' ? null : options.folderId };

	const where = {
		tenantId,
		deletedAt: null,
		...folderFilter,
	};

	const skip = (options.page - 1) * options.limit;

	const [items, total] = await Promise.all([
		prisma.file.findMany({
			where,
			orderBy: { [options.sortBy]: options.sortOrder },
			skip,
			take: options.limit,
		}),
		prisma.file.count({ where }),
	]);

	return {
		items: items.map(serializeFile),
		pagination: {
			page: options.page,
			limit: options.limit,
			total,
			totalPages: Math.max(1, Math.ceil(total / options.limit)),
		},
	};
}

export async function getFileById(
	tenantId: string,
	fileId: string,
): Promise<FileDTO | null> {
	const file = await prisma.file.findFirst({
		where: { id: fileId, tenantId, deletedAt: null },
	});
	return file ? serializeFile(file) : null;
}

export async function renameFile(
	tenantId: string,
	userId: string,
	fileId: string,
	name: string,
): Promise<FileDTO> {
	const existing = await prisma.file.findFirst({
		where: { id: fileId, tenantId, deletedAt: null },
	});
	if (!existing) {
		throw new HTTPException(404, { message: 'File not found' });
	}

	const updated = await prisma.$transaction(async (tx) => {
		const file = await tx.file.update({
			where: { id: fileId },
			data: { name },
		});

		await tx.activity.create({
			data: {
				tenantId,
				actorId: userId,
				action: 'FILE_RENAMED',
				targetType: 'FILE',
				fileId: file.id,
				targetName: file.name,
				metadata: { previousName: existing.name },
			},
		});

		return file;
	});

	return serializeFile(updated);
}

export async function moveFile(
	tenantId: string,
	userId: string,
	fileId: string,
	targetFolderId: string | null,
): Promise<FileDTO> {
	const existing = await prisma.file.findFirst({
		where: { id: fileId, tenantId, deletedAt: null },
	});
	if (!existing) {
		throw new HTTPException(404, { message: 'File not found' });
	}

	if (targetFolderId) {
		const target = await prisma.folder.findFirst({
			where: { id: targetFolderId, tenantId, deletedAt: null },
			select: { id: true },
		});
		if (!target) {
			throw new HTTPException(404, { message: 'Target folder not found' });
		}
	}

	const updated = await prisma.$transaction(async (tx) => {
		const file = await tx.file.update({
			where: { id: fileId },
			data: { folderId: targetFolderId },
		});

		await tx.activity.create({
			data: {
				tenantId,
				actorId: userId,
				action: 'FILE_MOVED',
				targetType: 'FILE',
				fileId: file.id,
				targetName: file.name,
				metadata: {
					fromFolderId: existing.folderId,
					toFolderId: targetFolderId,
				},
			},
		});

		return file;
	});

	return serializeFile(updated);
}

export async function softDeleteFile(
	tenantId: string,
	userId: string,
	fileId: string,
): Promise<FileDTO> {
	const existing = await prisma.file.findFirst({
		where: { id: fileId, tenantId, deletedAt: null },
	});
	if (!existing) {
		throw new HTTPException(404, { message: 'File not found' });
	}

	const now = new Date();
	const updated = await prisma.$transaction(async (tx) => {
		const file = await tx.file.update({
			where: { id: fileId },
			data: { deletedAt: now },
		});

		const analytics = await tx.tenantAnalytics.findUnique({
			where: { tenantId },
		});
		if (analytics) {
			await tx.tenantAnalytics.update({
				where: { tenantId },
				data: {
					totalFiles: Math.max(0, analytics.totalFiles - 1),
				},
			});
		}

		await tx.activity.create({
			data: {
				tenantId,
				actorId: userId,
				action: 'FILE_DELETED',
				targetType: 'FILE',
				fileId: file.id,
				targetName: file.name,
			},
		});

		return file;
	});

	return serializeFile(updated);
}

export async function createAuthorizedDownload(
	tenantId: string,
	userId: string,
	fileId: string,
	disposition: 'attachment' | 'inline',
): Promise<{
	downloadUrl: string;
	expiresInSeconds: number;
	file: FileDTO;
}> {
	const file = await prisma.file.findFirst({
		where: { id: fileId, tenantId, deletedAt: null },
	});
	if (!file) {
		throw new HTTPException(404, { message: 'File not found' });
	}

	const expiresInSeconds = 300;
	const downloadUrl = await createPresignedDownloadUrl({
		key: file.objectKey,
		fileName: file.name,
		disposition,
		expiresInSeconds,
	});

	await prisma.$transaction(async (tx) => {
		await tx.tenantAnalytics.upsert({
			where: { tenantId },
			create: { tenantId, totalDownloads: 1n },
			update: { totalDownloads: { increment: 1 } },
		});

		await tx.activity.create({
			data: {
				tenantId,
				actorId: userId,
				action: 'FILE_DOWNLOADED',
				targetType: 'FILE',
				fileId: file.id,
				targetName: file.name,
			},
		});
	});

	return {
		downloadUrl,
		expiresInSeconds,
		file: serializeFile(file),
	};
}
