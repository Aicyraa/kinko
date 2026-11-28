import { HTTPException } from 'hono/http-exception';
import type {
	FavoriteTargetType,
	TenantMember,
} from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.ts';
import {
	type FileDTO,
	type FolderDTO,
	serializeFile,
	serializeFolder,
} from '../../utils/serialize.ts';
import { assertFileAccess } from '../permissions/permissions.service.ts';

export interface FavoriteItemDTO {
	id: string;
	targetType: FavoriteTargetType;
	fileId: string | null;
	folderId: string | null;
	createdAt: string;
	file: FileDTO | null;
	folder: FolderDTO | null;
}

export async function listFavorites(
	tenantId: string,
	userId: string,
): Promise<{
	items: FavoriteItemDTO[];
	fileIds: string[];
	folderIds: string[];
}> {
	const rows = await prisma.favorite.findMany({
		where: { tenantId, userId },
		include: {
			file: true,
			folder: true,
		},
		orderBy: { createdAt: 'desc' },
	});

	const items: FavoriteItemDTO[] = [];
	const fileIds: string[] = [];
	const folderIds: string[] = [];

	for (const row of rows) {
		if (row.targetType === 'FILE') {
			if (!row.file || row.file.deletedAt !== null) continue;
			fileIds.push(row.file.id);
			items.push({
				id: row.id,
				targetType: row.targetType,
				fileId: row.file.id,
				folderId: null,
				createdAt: row.createdAt.toISOString(),
				file: serializeFile(row.file),
				folder: null,
			});
		} else if (row.targetType === 'FOLDER') {
			if (!row.folder || row.folder.deletedAt !== null) continue;
			folderIds.push(row.folder.id);
			items.push({
				id: row.id,
				targetType: row.targetType,
				fileId: null,
				folderId: row.folder.id,
				createdAt: row.createdAt.toISOString(),
				file: null,
				folder: serializeFolder(row.folder),
			});
		}
	}

	return { items, fileIds, folderIds };
}

export async function addFavorite(
	tenantId: string,
	tenantMembership: Pick<TenantMember, 'role'>,
	userId: string,
	targetType: FavoriteTargetType,
	targetId: string,
): Promise<FavoriteItemDTO> {
	if (targetType === 'FILE') {
		const file = await prisma.file.findFirst({
			where: { id: targetId, tenantId, deletedAt: null },
		});
		if (!file) {
			throw new HTTPException(404, { message: 'File not found' });
		}
		await assertFileAccess(tenantMembership, file, userId, 'VIEWER');

		const existing = await prisma.favorite.findFirst({
			where: { tenantId, userId, fileId: file.id },
		});
		const row =
			existing ??
			(await prisma.favorite.create({
				data: {
					tenantId,
					userId,
					targetType: 'FILE',
					fileId: file.id,
					folderId: null,
				},
			}));

		return {
			id: row.id,
			targetType: 'FILE',
			fileId: file.id,
			folderId: null,
			createdAt: row.createdAt.toISOString(),
			file: serializeFile(file),
			folder: null,
		};
	}

	const folder = await prisma.folder.findFirst({
		where: { id: targetId, tenantId, deletedAt: null },
	});
	if (!folder) {
		throw new HTTPException(404, { message: 'Folder not found' });
	}

	const existing = await prisma.favorite.findFirst({
		where: { tenantId, userId, folderId: folder.id },
	});
	const row =
		existing ??
		(await prisma.favorite.create({
			data: {
				tenantId,
				userId,
				targetType: 'FOLDER',
				fileId: null,
				folderId: folder.id,
			},
		}));

	return {
		id: row.id,
		targetType: 'FOLDER',
		fileId: null,
		folderId: folder.id,
		createdAt: row.createdAt.toISOString(),
		file: null,
		folder: serializeFolder(folder),
	};
}

export async function removeFavorite(
	tenantId: string,
	userId: string,
	targetType: FavoriteTargetType,
	targetId: string,
): Promise<{ removed: boolean }> {
	const result = await prisma.favorite.deleteMany({
		where:
			targetType === 'FILE'
				? { tenantId, userId, targetType: 'FILE', fileId: targetId }
				: { tenantId, userId, targetType: 'FOLDER', folderId: targetId },
	});
	return { removed: result.count > 0 };
}
