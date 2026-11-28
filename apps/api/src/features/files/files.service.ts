import { randomUUID } from 'node:crypto';
import { HTTPException } from 'hono/http-exception';
import { getMaxFileSizeBytes } from '../../env.ts';
import type { Tenant, TenantMember } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.ts';
import {
	createPresignedDownloadUrl,
	createPresignedUploadUrl,
	generateObjectKey,
	getStorageObjectBytes,
	putStorageObject,
} from '../../lib/storage.ts';
import {
	type FileDTO,
	type FileVersionDTO,
	serializeFile,
	serializeFileVersion,
	serializeUpload,
	type UploadDTO,
} from '../../utils/serialize.ts';
import { assertFileAccess } from '../permissions/permissions.service.ts';

const UPLOAD_INTENT_TTL_MS = 15 * 60_000;
const PRESIGNED_PUT_TTL_SECONDS = 300;

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
	tenantMembership: Pick<TenantMember, 'role'>,
	userId: string,
	fileId: string,
): Promise<FileDTO | null> {
	const file = await prisma.file.findFirst({
		where: { id: fileId, tenantId, deletedAt: null },
	});
	if (!file) return null;
	await assertFileAccess(tenantMembership, file, userId, 'VIEWER');
	return serializeFile(file);
}

export async function renameFile(
	tenantId: string,
	tenantMembership: Pick<TenantMember, 'role'>,
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
	await assertFileAccess(tenantMembership, existing, userId, 'EDITOR');

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
	tenantMembership: Pick<TenantMember, 'role'>,
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
	await assertFileAccess(tenantMembership, existing, userId, 'EDITOR');

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
	tenantMembership: Pick<TenantMember, 'role'>,
	userId: string,
	fileId: string,
): Promise<FileDTO> {
	const existing = await prisma.file.findFirst({
		where: { id: fileId, tenantId, deletedAt: null },
	});
	if (!existing) {
		throw new HTTPException(404, { message: 'File not found' });
	}
	await assertFileAccess(tenantMembership, existing, userId, 'OWNER');

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
	tenantMembership: Pick<TenantMember, 'role'>,
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
	await assertFileAccess(tenantMembership, file, userId, 'VIEWER');

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

export interface DuplicateGroupDTO {
	checksumSha256: string;
	count: number;
	totalSizeBytes: number;
	wastedBytes: number;
	files: FileDTO[];
}

export async function listDuplicateFiles(tenantId: string): Promise<{
	groups: DuplicateGroupDTO[];
	totalDuplicateFiles: number;
	totalWastedBytes: number;
}> {
	const files = await prisma.file.findMany({
		where: {
			tenantId,
			deletedAt: null,
			checksumSha256: { not: null },
		},
		orderBy: [{ createdAt: 'asc' }],
	});

	const byChecksum = new Map<string, typeof files>();
	for (const file of files) {
		if (!file.checksumSha256) continue;
		const existing = byChecksum.get(file.checksumSha256);
		if (existing) {
			existing.push(file);
		} else {
			byChecksum.set(file.checksumSha256, [file]);
		}
	}

	const groups: DuplicateGroupDTO[] = [];
	let totalDuplicateFiles = 0;
	let totalWastedBytes = 0;

	for (const [checksumSha256, grouped] of byChecksum.entries()) {
		if (grouped.length < 2) continue;
		const totalSizeBytes = grouped.reduce(
			(sum, f) => sum + Number(f.sizeBytes),
			0,
		);
		const firstSize = Number(grouped[0]?.sizeBytes ?? 0);
		const wastedBytes = Math.max(0, totalSizeBytes - firstSize);
		totalDuplicateFiles += grouped.length;
		totalWastedBytes += wastedBytes;
		groups.push({
			checksumSha256,
			count: grouped.length,
			totalSizeBytes,
			wastedBytes,
			files: grouped.map(serializeFile),
		});
	}

	groups.sort((a, b) => b.wastedBytes - a.wastedBytes);

	return {
		groups,
		totalDuplicateFiles,
		totalWastedBytes,
	};
}

export async function listFileVersions(
	tenantId: string,
	tenantMembership: Pick<TenantMember, 'role'>,
	userId: string,
	fileId: string,
): Promise<{ file: FileDTO; versions: FileVersionDTO[] }> {
	const file = await prisma.file.findFirst({
		where: { id: fileId, tenantId, deletedAt: null },
	});
	if (!file) {
		throw new HTTPException(404, { message: 'File not found' });
	}
	await assertFileAccess(tenantMembership, file, userId, 'VIEWER');

	const versions = await prisma.fileVersion.findMany({
		where: { tenantId, fileId },
		orderBy: { versionNumber: 'desc' },
	});

	return {
		file: serializeFile(file),
		versions: versions.map(serializeFileVersion),
	};
}

export async function createFileVersionUploadIntent(
	tenant: Tenant,
	tenantMembership: Pick<TenantMember, 'role'>,
	userId: string,
	fileId: string,
	input: { mimeType: string; sizeBytes: number },
): Promise<{
	upload: UploadDTO;
	uploadUrl: string;
	expiresInSeconds: number;
	requiredHeaders: Record<string, string>;
}> {
	const file = await prisma.file.findFirst({
		where: { id: fileId, tenantId: tenant.id, deletedAt: null },
	});
	if (!file) {
		throw new HTTPException(404, { message: 'File not found' });
	}
	await assertFileAccess(tenantMembership, file, userId, 'EDITOR');

	const maxFileSize = getMaxFileSizeBytes();
	if (input.sizeBytes > maxFileSize) {
		throw new HTTPException(413, {
			message: `File exceeds maximum allowed size of ${maxFileSize} bytes`,
		});
	}

	const now = new Date();
	const [storedAgg, pendingAgg] = await Promise.all([
		prisma.file.aggregate({
			where: { tenantId: tenant.id },
			_sum: { sizeBytes: true },
		}),
		prisma.upload.aggregate({
			where: {
				tenantId: tenant.id,
				status: { in: ['PENDING', 'IN_PROGRESS'] },
				expiresAt: { gt: now },
			},
			_sum: { declaredSizeBytes: true },
		}),
	]);
	const effectiveUsed =
		(storedAgg._sum.sizeBytes ?? 0n) + (pendingAgg._sum.declaredSizeBytes ?? 0n);

	if (effectiveUsed + BigInt(input.sizeBytes) > tenant.storageQuotaBytes) {
		throw new HTTPException(413, {
			message: 'Tenant storage quota exceeded',
		});
	}

	const objectKey = generateObjectKey(tenant.id, `${file.id}-v-${randomUUID()}`);
	const expiresAt = new Date(Date.now() + UPLOAD_INTENT_TTL_MS);

	const upload = await prisma.upload.create({
		data: {
			tenantId: tenant.id,
			folderId: file.folderId,
			fileId: file.id,
			uploadedById: userId,
			fileName: file.name,
			mimeType: input.mimeType,
			declaredSizeBytes: BigInt(input.sizeBytes),
			objectKey,
			status: 'PENDING',
			expiresAt,
		},
	});

	const uploadUrl = await createPresignedUploadUrl({
		key: objectKey,
		contentType: input.mimeType,
		expiresInSeconds: PRESIGNED_PUT_TTL_SECONDS,
	});

	return {
		upload: serializeUpload(upload),
		uploadUrl,
		expiresInSeconds: PRESIGNED_PUT_TTL_SECONDS,
		requiredHeaders: {
			'Content-Type': input.mimeType,
		},
	};
}

export async function downloadFileVersion(
	tenantId: string,
	tenantMembership: Pick<TenantMember, 'role'>,
	userId: string,
	fileId: string,
	versionId: string,
): Promise<{
	downloadUrl: string;
	expiresInSeconds: number;
	version: FileVersionDTO;
}> {
	const file = await prisma.file.findFirst({
		where: { id: fileId, tenantId, deletedAt: null },
	});
	if (!file) {
		throw new HTTPException(404, { message: 'File not found' });
	}
	await assertFileAccess(tenantMembership, file, userId, 'VIEWER');

	const version = await prisma.fileVersion.findFirst({
		where: { id: versionId, tenantId, fileId },
	});
	if (!version) {
		throw new HTTPException(404, { message: 'File version not found' });
	}

	const expiresInSeconds = 300;
	const downloadUrl = await createPresignedDownloadUrl({
		key: version.objectKey,
		fileName: `v${version.versionNumber}-${file.name}`,
		disposition: 'attachment',
		expiresInSeconds,
	});

	return {
		downloadUrl,
		expiresInSeconds,
		version: serializeFileVersion(version),
	};
}

export async function restoreFileVersion(
	tenantId: string,
	tenantMembership: Pick<TenantMember, 'role'>,
	userId: string,
	fileId: string,
	versionId: string,
): Promise<{ file: FileDTO; version: FileVersionDTO }> {
	const file = await prisma.file.findFirst({
		where: { id: fileId, tenantId, deletedAt: null },
	});
	if (!file) {
		throw new HTTPException(404, { message: 'File not found' });
	}
	await assertFileAccess(tenantMembership, file, userId, 'EDITOR');

	const sourceVersion = await prisma.fileVersion.findFirst({
		where: { id: versionId, tenantId, fileId },
	});
	if (!sourceVersion) {
		throw new HTTPException(404, { message: 'File version not found' });
	}

	const bytes = await getStorageObjectBytes(sourceVersion.objectKey);
	const nextKey = generateObjectKey(tenantId, `${file.id}-restore-${randomUUID()}`);
	await putStorageObject({
		key: nextKey,
		body: bytes,
		contentType: sourceVersion.mimeType,
	});

	const nextVersionNumber = file.currentVersion + 1;

	const result = await prisma.$transaction(async (tx) => {
		const createdVersion = await tx.fileVersion.create({
			data: {
				tenantId,
				fileId: file.id,
				versionNumber: nextVersionNumber,
				objectKey: nextKey,
				mimeType: sourceVersion.mimeType,
				sizeBytes: sourceVersion.sizeBytes,
				checksumSha256: sourceVersion.checksumSha256,
				uploadedById: userId,
			},
		});

		const updatedFile = await tx.file.update({
			where: { id: file.id },
			data: {
				objectKey: nextKey,
				mimeType: sourceVersion.mimeType,
				sizeBytes: sourceVersion.sizeBytes,
				checksumSha256: sourceVersion.checksumSha256,
				currentVersion: nextVersionNumber,
			},
		});

		await tx.tenantAnalytics.upsert({
			where: { tenantId },
			create: {
				tenantId,
				storageUsedBytes: sourceVersion.sizeBytes,
			},
			update: {
				storageUsedBytes: { increment: sourceVersion.sizeBytes },
			},
		});

		await tx.activity.create({
			data: {
				tenantId,
				actorId: userId,
				action: 'FILE_VERSION_CREATED',
				targetType: 'FILE',
				fileId: file.id,
				targetName: file.name,
				metadata: {
					versionNumber: nextVersionNumber,
					restoredFromVersion: sourceVersion.versionNumber,
				},
			},
		});

		return { updatedFile, createdVersion };
	});

	return {
		file: serializeFile(result.updatedFile),
		version: serializeFileVersion(result.createdVersion),
	};
}
