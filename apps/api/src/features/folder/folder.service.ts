import { HTTPException } from 'hono/http-exception';
import { prisma } from '../../lib/prisma.ts';
import {
	type FileDTO,
	type FolderDTO,
	serializeFile,
	serializeFolder,
} from '../../utils/serialize.ts';

export interface BreadcrumbItem {
	id: string;
	name: string;
}

export async function listFolders(
	tenantId: string,
	options: {
		parentFolderId?: string;
		sortBy: 'name' | 'createdAt' | 'updatedAt';
		sortOrder: 'asc' | 'desc';
	},
): Promise<FolderDTO[]> {
	const parentFilter =
		options.parentFolderId === undefined
			? {}
			: {
					parentFolderId:
						options.parentFolderId === 'root' ? null : options.parentFolderId,
				};

	const folders = await prisma.folder.findMany({
		where: {
			tenantId,
			deletedAt: null,
			...parentFilter,
		},
		orderBy: { [options.sortBy]: options.sortOrder },
	});

	return folders.map(serializeFolder);
}

export async function getFolderDetails(
	tenantId: string,
	folderId: string,
): Promise<{
	folder: FolderDTO;
	breadcrumbs: BreadcrumbItem[];
	children: FolderDTO[];
	files: FileDTO[];
} | null> {
	const folder = await prisma.folder.findFirst({
		where: { id: folderId, tenantId, deletedAt: null },
	});

	if (!folder) return null;

	// Build breadcrumbs by walking parentFolderId within the same tenant
	const breadcrumbs: BreadcrumbItem[] = [{ id: folder.id, name: folder.name }];
	let currentParentId = folder.parentFolderId;
	const visited = new Set<string>([folder.id]);

	while (currentParentId && !visited.has(currentParentId)) {
		visited.add(currentParentId);
		const parent = await prisma.folder.findFirst({
			where: { id: currentParentId, tenantId, deletedAt: null },
			select: { id: true, name: true, parentFolderId: true },
		});
		if (!parent) break;
		breadcrumbs.unshift({ id: parent.id, name: parent.name });
		currentParentId = parent.parentFolderId;
	}

	const [children, files] = await Promise.all([
		prisma.folder.findMany({
			where: { tenantId, parentFolderId: folder.id, deletedAt: null },
			orderBy: { name: 'asc' },
		}),
		prisma.file.findMany({
			where: { tenantId, folderId: folder.id, deletedAt: null },
			orderBy: { name: 'asc' },
		}),
	]);

	return {
		folder: serializeFolder(folder),
		breadcrumbs,
		children: children.map(serializeFolder),
		files: files.map(serializeFile),
	};
}

async function assertNoSiblingCollision(
	tenantId: string,
	parentFolderId: string | null,
	name: string,
	excludeFolderId?: string,
) {
	const existing = await prisma.folder.findFirst({
		where: {
			tenantId,
			parentFolderId,
			name,
			deletedAt: null,
			...(excludeFolderId ? { id: { not: excludeFolderId } } : {}),
		},
		select: { id: true },
	});

	if (existing) {
		throw new HTTPException(409, {
			message: `A folder named "${name}" already exists in this location`,
		});
	}
}

export async function createFolder(
	tenantId: string,
	userId: string,
	input: { name: string; parentFolderId?: string | null },
): Promise<FolderDTO> {
	const parentFolderId = input.parentFolderId ?? null;

	if (parentFolderId) {
		const parent = await prisma.folder.findFirst({
			where: { id: parentFolderId, tenantId, deletedAt: null },
			select: { id: true },
		});
		if (!parent) {
			throw new HTTPException(404, { message: 'Parent folder not found' });
		}
	}

	await assertNoSiblingCollision(tenantId, parentFolderId, input.name);

	const created = await prisma.$transaction(async (tx) => {
		const folder = await tx.folder.create({
			data: {
				tenantId,
				parentFolderId,
				name: input.name,
				createdById: userId,
			},
		});

		await tx.tenantAnalytics.upsert({
			where: { tenantId },
			create: { tenantId, totalFolders: 1 },
			update: { totalFolders: { increment: 1 } },
		});

		await tx.activity.create({
			data: {
				tenantId,
				actorId: userId,
				action: 'FOLDER_CREATED',
				targetType: 'FOLDER',
				folderId: folder.id,
				targetName: folder.name,
			},
		});

		return folder;
	});

	return serializeFolder(created);
}

export async function renameFolder(
	tenantId: string,
	userId: string,
	folderId: string,
	name: string,
): Promise<FolderDTO> {
	const existing = await prisma.folder.findFirst({
		where: { id: folderId, tenantId, deletedAt: null },
	});
	if (!existing) {
		throw new HTTPException(404, { message: 'Folder not found' });
	}

	await assertNoSiblingCollision(
		tenantId,
		existing.parentFolderId,
		name,
		folderId,
	);

	const updated = await prisma.$transaction(async (tx) => {
		const folder = await tx.folder.update({
			where: { id: folderId },
			data: { name },
		});

		await tx.activity.create({
			data: {
				tenantId,
				actorId: userId,
				action: 'FOLDER_RENAMED',
				targetType: 'FOLDER',
				folderId: folder.id,
				targetName: folder.name,
				metadata: { previousName: existing.name },
			},
		});

		return folder;
	});

	return serializeFolder(updated);
}

export async function moveFolder(
	tenantId: string,
	userId: string,
	folderId: string,
	targetParentFolderId: string | null,
): Promise<FolderDTO> {
	const source = await prisma.folder.findFirst({
		where: { id: folderId, tenantId, deletedAt: null },
	});
	if (!source) {
		throw new HTTPException(404, { message: 'Folder not found' });
	}

	if (targetParentFolderId === folderId) {
		throw new HTTPException(400, {
			message: 'Cannot move a folder into itself',
		});
	}

	if (targetParentFolderId) {
		const target = await prisma.folder.findFirst({
			where: { id: targetParentFolderId, tenantId, deletedAt: null },
			select: { id: true, parentFolderId: true },
		});
		if (!target) {
			throw new HTTPException(404, { message: 'Target folder not found' });
		}

		// Prevent cycles: walk target's ancestors to ensure `folderId` is not one of them
		let cursor: string | null = target.parentFolderId;
		const visited = new Set<string>([target.id]);
		while (cursor && !visited.has(cursor)) {
			if (cursor === folderId) {
				throw new HTTPException(400, {
					message: 'Cannot move a folder into one of its descendants',
				});
			}
			visited.add(cursor);
			const ancestor = await prisma.folder.findFirst({
				where: { id: cursor, tenantId, deletedAt: null },
				select: { parentFolderId: true },
			});
			cursor = ancestor?.parentFolderId ?? null;
		}
	}

	await assertNoSiblingCollision(
		tenantId,
		targetParentFolderId,
		source.name,
		folderId,
	);

	const updated = await prisma.$transaction(async (tx) => {
		const folder = await tx.folder.update({
			where: { id: folderId },
			data: { parentFolderId: targetParentFolderId },
		});

		await tx.activity.create({
			data: {
				tenantId,
				actorId: userId,
				action: 'FOLDER_MOVED',
				targetType: 'FOLDER',
				folderId: folder.id,
				targetName: folder.name,
				metadata: {
					fromParentFolderId: source.parentFolderId,
					toParentFolderId: targetParentFolderId,
				},
			},
		});

		return folder;
	});

	return serializeFolder(updated);
}

export async function softDeleteFolder(
	tenantId: string,
	userId: string,
	folderId: string,
): Promise<{ deletedFolderCount: number; deletedFileCount: number }> {
	const root = await prisma.folder.findFirst({
		where: { id: folderId, tenantId, deletedAt: null },
	});
	if (!root) {
		throw new HTTPException(404, { message: 'Folder not found' });
	}

	// BFS to collect all active descendant folder IDs within this tenant
	const folderIdsToDelete: string[] = [root.id];
	let frontier: string[] = [root.id];

	while (frontier.length > 0) {
		const children = await prisma.folder.findMany({
			where: {
				tenantId,
				parentFolderId: { in: frontier },
				deletedAt: null,
			},
			select: { id: true },
		});
		frontier = children.map((c) => c.id);
		folderIdsToDelete.push(...frontier);
	}

	const now = new Date();

	return prisma.$transaction(async (tx) => {
		const [folderResult, fileResult] = await Promise.all([
			tx.folder.updateMany({
				where: {
					tenantId,
					id: { in: folderIdsToDelete },
					deletedAt: null,
				},
				data: { deletedAt: now },
			}),
			tx.file.updateMany({
				where: {
					tenantId,
					folderId: { in: folderIdsToDelete },
					deletedAt: null,
				},
				data: { deletedAt: now },
			}),
		]);

		const analytics = await tx.tenantAnalytics.findUnique({
			where: { tenantId },
		});
		if (analytics) {
			await tx.tenantAnalytics.update({
				where: { tenantId },
				data: {
					totalFolders: Math.max(
						0,
						analytics.totalFolders - folderResult.count,
					),
					totalFiles: Math.max(0, analytics.totalFiles - fileResult.count),
				},
			});
		}

		await tx.activity.create({
			data: {
				tenantId,
				actorId: userId,
				action: 'FOLDER_DELETED',
				targetType: 'FOLDER',
				folderId: root.id,
				targetName: root.name,
				metadata: {
					deletedFolderCount: folderResult.count,
					deletedFileCount: fileResult.count,
				},
			},
		});

		return {
			deletedFolderCount: folderResult.count,
			deletedFileCount: fileResult.count,
		};
	});
}
