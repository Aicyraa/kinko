import { HTTPException } from 'hono/http-exception';
import { env } from '../../env.ts';
import { prisma } from '../../lib/prisma.ts';
import { deleteStorageObject } from '../../lib/storage.ts';

export interface TrashItemDTO {
	id: string;
	kind: 'file' | 'folder';
	tenantId: string;
	name: string;
	deletedAt: string;
	expiresAt: string;
	mimeType: string | null;
	sizeBytes: number | null;
	parentFolderId: string | null;
	folderId: string | null;
}

function computeExpiresAt(deletedAt: Date): Date {
	return new Date(
		deletedAt.getTime() + env.TRASH_RETENTION_DAYS * 86_400_000,
	);
}

export async function listTrash(tenantId: string): Promise<{
	items: TrashItemDTO[];
	retentionDays: number;
}> {
	const [folders, files] = await Promise.all([
		prisma.folder.findMany({
			where: { tenantId, deletedAt: { not: null } },
			orderBy: { deletedAt: 'desc' },
		}),
		prisma.file.findMany({
			where: { tenantId, deletedAt: { not: null } },
			orderBy: { deletedAt: 'desc' },
		}),
	]);

	const items: TrashItemDTO[] = [
		...folders.map((folder) => {
			const deletedAt = folder.deletedAt ?? folder.updatedAt;
			return {
				id: folder.id,
				kind: 'folder' as const,
				tenantId: folder.tenantId,
				name: folder.name,
				deletedAt: deletedAt.toISOString(),
				expiresAt: computeExpiresAt(deletedAt).toISOString(),
				mimeType: null,
				sizeBytes: null,
				parentFolderId: folder.parentFolderId,
				folderId: null,
			};
		}),
		...files.map((file) => {
			const deletedAt = file.deletedAt ?? file.updatedAt;
			return {
				id: file.id,
				kind: 'file' as const,
				tenantId: file.tenantId,
				name: file.name,
				deletedAt: deletedAt.toISOString(),
				expiresAt: computeExpiresAt(deletedAt).toISOString(),
				mimeType: file.mimeType,
				sizeBytes: Number(file.sizeBytes),
				parentFolderId: null,
				folderId: file.folderId,
			};
		}),
	].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));

	return {
		items,
		retentionDays: env.TRASH_RETENTION_DAYS,
	};
}

export async function restoreTrashItem(
	tenantId: string,
	userId: string,
	itemId: string,
	preferredKind?: 'file' | 'folder',
): Promise<{
	kind: 'file' | 'folder';
	id: string;
	name: string;
	restoredToRoot: boolean;
}> {
	if (preferredKind !== 'folder') {
		const file = await prisma.file.findFirst({
			where: { id: itemId, tenantId, deletedAt: { not: null } },
		});
		if (file) {
			let targetFolderId = file.folderId;
			let restoredToRoot = false;
			if (targetFolderId) {
				const parent = await prisma.folder.findFirst({
					where: { id: targetFolderId, tenantId, deletedAt: null },
					select: { id: true },
				});
				if (!parent) {
					targetFolderId = null;
					restoredToRoot = true;
				}
			}

			await prisma.$transaction(async (tx) => {
				await tx.file.update({
					where: { id: file.id },
					data: { deletedAt: null, folderId: targetFolderId },
				});
				await tx.tenantAnalytics.upsert({
					where: { tenantId },
					create: { tenantId, totalFiles: 1 },
					update: { totalFiles: { increment: 1 } },
				});
				await tx.activity.create({
					data: {
						tenantId,
						actorId: userId,
						action: 'FILE_RESTORED',
						targetType: 'FILE',
						fileId: file.id,
						targetName: file.name,
						metadata: { restoredToRoot },
					},
				});
			});

			return {
				kind: 'file',
				id: file.id,
				name: file.name,
				restoredToRoot,
			};
		}
	}

	const rootFolder = await prisma.folder.findFirst({
		where: { id: itemId, tenantId, deletedAt: { not: null } },
	});
	if (!rootFolder) {
		throw new HTTPException(404, { message: 'Trash item not found' });
	}

	let targetParentId = rootFolder.parentFolderId;
	let restoredToRoot = false;
	if (targetParentId) {
		const parent = await prisma.folder.findFirst({
			where: { id: targetParentId, tenantId, deletedAt: null },
			select: { id: true },
		});
		if (!parent) {
			targetParentId = null;
			restoredToRoot = true;
		}
	}

	// Collect all soft-deleted descendant folders in tenant
	const folderIdsToRestore: string[] = [rootFolder.id];
	let frontier: string[] = [rootFolder.id];
	while (frontier.length > 0) {
		const children = await prisma.folder.findMany({
			where: {
				tenantId,
				parentFolderId: { in: frontier },
				deletedAt: { not: null },
			},
			select: { id: true },
		});
		frontier = children.map((c) => c.id);
		folderIdsToRestore.push(...frontier);
	}

	await prisma.$transaction(async (tx) => {
		const [folderResult, fileResult] = await Promise.all([
			tx.folder.updateMany({
				where: {
					tenantId,
					id: { in: folderIdsToRestore },
					deletedAt: { not: null },
				},
				data: { deletedAt: null },
			}),
			tx.file.updateMany({
				where: {
					tenantId,
					folderId: { in: folderIdsToRestore },
					deletedAt: { not: null },
				},
				data: { deletedAt: null },
			}),
		]);

		if (restoredToRoot) {
			await tx.folder.update({
				where: { id: rootFolder.id },
				data: { parentFolderId: null },
			});
		}

		await tx.tenantAnalytics.upsert({
			where: { tenantId },
			create: {
				tenantId,
				totalFolders: folderResult.count,
				totalFiles: fileResult.count,
			},
			update: {
				totalFolders: { increment: folderResult.count },
				totalFiles: { increment: fileResult.count },
			},
		});

		await tx.activity.create({
			data: {
				tenantId,
				actorId: userId,
				action: 'FOLDER_RESTORED',
				targetType: 'FOLDER',
				folderId: rootFolder.id,
				targetName: rootFolder.name,
				metadata: {
					restoredToRoot,
					restoredFolderCount: folderResult.count,
					restoredFileCount: fileResult.count,
				},
			},
		});
	});

	return {
		kind: 'folder',
		id: rootFolder.id,
		name: rootFolder.name,
		restoredToRoot,
	};
}

export async function permanentlyDeleteFileRecord(
	tenantId: string,
	actorId: string | null,
	fileId: string,
): Promise<{ deletedFiles: number; freedBytes: number }> {
	const file = await prisma.file.findFirst({
		where: { id: fileId, tenantId, deletedAt: { not: null } },
		include: {
			versions: { select: { objectKey: true, sizeBytes: true } },
		},
	});
	if (!file) {
		throw new HTTPException(404, { message: 'Trash item not found' });
	}

	const objectKeys = new Set<string>([file.objectKey]);
	for (const v of file.versions) {
		objectKeys.add(v.objectKey);
	}

	await Promise.all(
		Array.from(objectKeys).map((key) => deleteStorageObject(key)),
	);

	const freedBytesBig = file.sizeBytes;

	await prisma.$transaction(async (tx) => {
		await tx.file.delete({ where: { id: file.id } });

		const analytics = await tx.tenantAnalytics.findUnique({
			where: { tenantId },
		});
		if (analytics) {
			const nextUsed = analytics.storageUsedBytes - freedBytesBig;
			await tx.tenantAnalytics.update({
				where: { tenantId },
				data: {
					storageUsedBytes: nextUsed > 0n ? nextUsed : 0n,
				},
			});
		}

		await tx.activity.create({
			data: {
				tenantId,
				actorId,
				action: 'FILE_PERMANENTLY_DELETED',
				targetType: 'FILE',
				fileId: null,
				targetName: file.name,
				metadata: { freedBytes: Number(freedBytesBig) },
			},
		});
	});

	return { deletedFiles: 1, freedBytes: Number(freedBytesBig) };
}

export async function permanentlyDeleteFolderRecord(
	tenantId: string,
	actorId: string | null,
	folderId: string,
): Promise<{
	deletedFolders: number;
	deletedFiles: number;
	freedBytes: number;
}> {
	const rootFolder = await prisma.folder.findFirst({
		where: { id: folderId, tenantId, deletedAt: { not: null } },
	});
	if (!rootFolder) {
		throw new HTTPException(404, { message: 'Trash item not found' });
	}

	// Collect all descendant folder IDs in tenant
	const allFolderIds: string[] = [rootFolder.id];
	let frontier: string[] = [rootFolder.id];
	while (frontier.length > 0) {
		const children = await prisma.folder.findMany({
			where: { tenantId, parentFolderId: { in: frontier } },
			select: { id: true },
		});
		frontier = children.map((c) => c.id);
		allFolderIds.push(...frontier);
	}

	const files = await prisma.file.findMany({
		where: { tenantId, folderId: { in: allFolderIds } },
		include: { versions: { select: { objectKey: true } } },
	});

	const objectKeys = new Set<string>();
	let freedBytesBig = 0n;
	for (const file of files) {
		objectKeys.add(file.objectKey);
		freedBytesBig += file.sizeBytes;
		for (const v of file.versions) {
			objectKeys.add(v.objectKey);
		}
	}

	await Promise.all(
		Array.from(objectKeys).map((key) => deleteStorageObject(key)),
	);

	await prisma.$transaction(async (tx) => {
		// Deleting rootFolder cascades to child folders, files, and file_versions
		await tx.folder.delete({ where: { id: rootFolder.id } });

		const analytics = await tx.tenantAnalytics.findUnique({
			where: { tenantId },
		});
		if (analytics) {
			const nextUsed = analytics.storageUsedBytes - freedBytesBig;
			await tx.tenantAnalytics.update({
				where: { tenantId },
				data: {
					storageUsedBytes: nextUsed > 0n ? nextUsed : 0n,
				},
			});
		}

		await tx.activity.create({
			data: {
				tenantId,
				actorId,
				action: 'FOLDER_PERMANENTLY_DELETED',
				targetType: 'FOLDER',
				folderId: null,
				targetName: rootFolder.name,
				metadata: {
					deletedFolders: allFolderIds.length,
					deletedFiles: files.length,
					freedBytes: Number(freedBytesBig),
				},
			},
		});
	});

	return {
		deletedFolders: allFolderIds.length,
		deletedFiles: files.length,
		freedBytes: Number(freedBytesBig),
	};
}

export async function permanentlyDeleteTrashItem(
	tenantId: string,
	userId: string,
	itemId: string,
): Promise<{
	deletedFolders: number;
	deletedFiles: number;
	freedBytes: number;
}> {
	const file = await prisma.file.findFirst({
		where: { id: itemId, tenantId, deletedAt: { not: null } },
		select: { id: true },
	});
	if (file) {
		const res = await permanentlyDeleteFileRecord(tenantId, userId, file.id);
		return { deletedFolders: 0, ...res };
	}

	return permanentlyDeleteFolderRecord(tenantId, userId, itemId);
}
