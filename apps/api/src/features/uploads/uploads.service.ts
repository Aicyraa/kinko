import { createHash, randomUUID } from 'node:crypto';
import { HTTPException } from 'hono/http-exception';
import { getMaxFileSizeBytes } from '../../env.ts';
import type { Tenant, TenantMember, Upload } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.ts';
import {
	abortS3MultipartUpload,
	completeS3MultipartUpload,
	createPresignedPartUploadUrl,
	createPresignedUploadUrl,
	createS3MultipartUpload,
	deleteStorageObject,
	generateObjectKey,
	getStorageObjectBytes,
	headStorageObject,
} from '../../lib/storage.ts';
import {
	type FileDTO,
	serializeFile,
	serializeUpload,
	serializeUploadPart,
	type UploadDTO,
	type UploadPartDTO,
} from '../../utils/serialize.ts';
import { assertFileAccess } from '../permissions/permissions.service.ts';

const UPLOAD_INTENT_TTL_MS = 15 * 60_000;
const MULTIPART_INTENT_TTL_MS = 24 * 60 * 60_000;
const PRESIGNED_PUT_TTL_SECONDS = 300;
const SERVER_CHECKSUM_LIMIT_BYTES = 50 * 1024 * 1024;

async function getTenantStoredBytes(tenantId: string): Promise<bigint> {
	const filesAgg = await prisma.file.aggregate({
		where: { tenantId },
		_sum: { sizeBytes: true },
	});
	return filesAgg._sum.sizeBytes ?? 0n;
}

async function getTenantEffectiveBytes(tenantId: string): Promise<bigint> {
	const now = new Date();
	const [storedBytes, pendingAgg] = await Promise.all([
		getTenantStoredBytes(tenantId),
		prisma.upload.aggregate({
			where: {
				tenantId,
				status: { in: ['PENDING', 'IN_PROGRESS'] },
				expiresAt: { gt: now },
			},
			_sum: { declaredSizeBytes: true },
		}),
	]);
	return storedBytes + (pendingAgg._sum.declaredSizeBytes ?? 0n);
}

async function resolveFileChecksum(
	objectKey: string,
	actualSize: number,
	clientChecksum?: string,
): Promise<string | null> {
	if (actualSize <= SERVER_CHECKSUM_LIMIT_BYTES) {
		const bytes = await getStorageObjectBytes(objectKey);
		return createHash('sha256').update(bytes).digest('hex');
	}
	return clientChecksum?.toLowerCase() ?? null;
}

async function findDuplicatesForChecksum(
	tenantId: string,
	checksumSha256: string | null,
	excludeFileId: string,
): Promise<FileDTO[]> {
	if (!checksumSha256) return [];
	const matches = await prisma.file.findMany({
		where: {
			tenantId,
			deletedAt: null,
			checksumSha256,
			id: { not: excludeFileId },
		},
		orderBy: { createdAt: 'asc' },
		take: 20,
	});
	return matches.map(serializeFile);
}

async function finalizeUploadedObject(params: {
	tenant: Tenant;
	tenantMembership: Pick<TenantMember, 'role'>;
	userId: string;
	upload: Upload;
	actualSize: number;
	checksum: string | null;
	now: Date;
}): Promise<{
	file: FileDTO;
	isDuplicate: boolean;
	duplicateOf: FileDTO[];
}> {
	const { tenant, tenantMembership, userId, upload, actualSize, checksum, now } =
		params;

	if (upload.fileId) {
		const targetFile = await prisma.file.findFirst({
			where: { id: upload.fileId, tenantId: tenant.id, deletedAt: null },
		});
		if (!targetFile) {
			throw new HTTPException(404, { message: 'Target file not found' });
		}
		await assertFileAccess(tenantMembership, targetFile, userId, 'EDITOR');
		const nextVersion = targetFile.currentVersion + 1;

		const updatedFile = await prisma.$transaction(async (tx) => {
			await tx.fileVersion.create({
				data: {
					tenantId: tenant.id,
					fileId: targetFile.id,
					versionNumber: nextVersion,
					objectKey: upload.objectKey,
					mimeType: upload.mimeType,
					sizeBytes: BigInt(actualSize),
					checksumSha256: checksum,
					uploadedById: userId,
				},
			});

			const nextFile = await tx.file.update({
				where: { id: targetFile.id },
				data: {
					objectKey: upload.objectKey,
					mimeType: upload.mimeType,
					sizeBytes: BigInt(actualSize),
					checksumSha256: checksum,
					currentVersion: nextVersion,
				},
			});

			await tx.upload.update({
				where: { id: upload.id },
				data: {
					status: 'COMPLETED',
					completedAt: now,
				},
			});

			await tx.tenantAnalytics.upsert({
				where: { tenantId: tenant.id },
				create: {
					tenantId: tenant.id,
					storageUsedBytes: BigInt(actualSize),
					totalUploads: 1n,
				},
				update: {
					storageUsedBytes: { increment: BigInt(actualSize) },
					totalUploads: { increment: 1 },
				},
			});

			await tx.activity.create({
				data: {
					tenantId: tenant.id,
					actorId: userId,
					action: 'FILE_VERSION_CREATED',
					targetType: 'FILE',
					fileId: targetFile.id,
					targetName: targetFile.name,
					metadata: {
						versionNumber: nextVersion,
						sizeBytes: actualSize,
						mimeType: upload.mimeType,
					},
				},
			});

			return nextFile;
		});

		const duplicateOf = await findDuplicatesForChecksum(
			tenant.id,
			checksum,
			updatedFile.id,
		);

		return {
			file: serializeFile(updatedFile),
			isDuplicate: duplicateOf.length > 0,
			duplicateOf,
		};
	}

	const created = await prisma.$transaction(async (tx) => {
		const createdFile = await tx.file.create({
			data: {
				tenantId: tenant.id,
				folderId: upload.folderId,
				uploadedById: userId,
				name: upload.fileName,
				objectKey: upload.objectKey,
				mimeType: upload.mimeType,
				sizeBytes: BigInt(actualSize),
				checksumSha256: checksum,
				currentVersion: 1,
			},
		});

		await tx.fileVersion.create({
			data: {
				tenantId: tenant.id,
				fileId: createdFile.id,
				versionNumber: 1,
				objectKey: upload.objectKey,
				mimeType: upload.mimeType,
				sizeBytes: BigInt(actualSize),
				checksumSha256: checksum,
				uploadedById: userId,
			},
		});

		await tx.upload.update({
			where: { id: upload.id },
			data: {
				status: 'COMPLETED',
				fileId: createdFile.id,
				completedAt: now,
			},
		});

		await tx.tenantAnalytics.upsert({
			where: { tenantId: tenant.id },
			create: {
				tenantId: tenant.id,
				storageUsedBytes: BigInt(actualSize),
				totalFiles: 1,
				totalUploads: 1n,
			},
			update: {
				storageUsedBytes: { increment: BigInt(actualSize) },
				totalFiles: { increment: 1 },
				totalUploads: { increment: 1 },
			},
		});

		await tx.activity.create({
			data: {
				tenantId: tenant.id,
				actorId: userId,
				action: 'FILE_UPLOADED',
				targetType: 'FILE',
				fileId: createdFile.id,
				targetName: createdFile.name,
				metadata: {
					sizeBytes: actualSize,
					mimeType: createdFile.mimeType,
				},
			},
		});

		return createdFile;
	});

	const duplicateOf = await findDuplicatesForChecksum(
		tenant.id,
		checksum,
		created.id,
	);

	return {
		file: serializeFile(created),
		isDuplicate: duplicateOf.length > 0,
		duplicateOf,
	};
}

export async function createUploadIntent(
	tenant: Tenant,
	userId: string,
	input: {
		fileName: string;
		mimeType: string;
		sizeBytes: number;
		folderId?: string | null;
	},
): Promise<{
	upload: UploadDTO;
	uploadUrl: string;
	expiresInSeconds: number;
	requiredHeaders: Record<string, string>;
}> {
	const maxFileSize = getMaxFileSizeBytes();
	if (input.sizeBytes > maxFileSize) {
		throw new HTTPException(413, {
			message: `File exceeds maximum allowed size of ${maxFileSize} bytes`,
		});
	}

	const folderId = input.folderId ?? null;
	if (folderId) {
		const folder = await prisma.folder.findFirst({
			where: { id: folderId, tenantId: tenant.id, deletedAt: null },
			select: { id: true },
		});
		if (!folder) {
			throw new HTTPException(404, { message: 'Target folder not found' });
		}
	}

	const effectiveUsed = await getTenantEffectiveBytes(tenant.id);
	if (effectiveUsed + BigInt(input.sizeBytes) > tenant.storageQuotaBytes) {
		throw new HTTPException(413, {
			message: 'Tenant storage quota exceeded',
		});
	}

	const fileId = randomUUID();
	const objectKey = generateObjectKey(tenant.id, fileId);
	const expiresAt = new Date(Date.now() + UPLOAD_INTENT_TTL_MS);

	const upload = await prisma.upload.create({
		data: {
			tenantId: tenant.id,
			folderId,
			uploadedById: userId,
			fileName: input.fileName,
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

export async function completeUpload(
	tenant: Tenant,
	tenantMembership: Pick<TenantMember, 'role'>,
	userId: string,
	uploadId: string,
	input: { checksumSha256?: string },
): Promise<{
	file: FileDTO;
	isDuplicate: boolean;
	duplicateOf: FileDTO[];
}> {
	const upload = await prisma.upload.findFirst({
		where: { id: uploadId, tenantId: tenant.id },
	});

	if (!upload) {
		throw new HTTPException(404, { message: 'Upload intent not found' });
	}

	if (upload.status !== 'PENDING' && upload.status !== 'IN_PROGRESS') {
		throw new HTTPException(409, {
			message: `Upload is already ${upload.status.toLowerCase()}`,
		});
	}

	const now = new Date();
	if (upload.expiresAt <= now) {
		await prisma.upload.update({
			where: { id: upload.id },
			data: { status: 'EXPIRED' },
		});
		throw new HTTPException(410, { message: 'Upload intent has expired' });
	}

	const head = await headStorageObject(upload.objectKey);
	if (!head.exists) {
		throw new HTTPException(400, {
			message: 'Object not found in storage; upload the file before completing',
		});
	}

	const actualSize = head.contentLength;
	const maxFileSize = getMaxFileSizeBytes();

	if (actualSize <= 0 || actualSize > maxFileSize) {
		await deleteStorageObject(upload.objectKey).catch(() => {});
		await prisma.upload.update({
			where: { id: upload.id },
			data: { status: 'ABORTED' },
		});
		throw new HTTPException(413, {
			message:
				actualSize <= 0
					? 'Uploaded object cannot be empty'
					: `Uploaded object exceeds maximum allowed size of ${maxFileSize} bytes`,
		});
	}

	const storedUsed = await getTenantStoredBytes(tenant.id);
	if (storedUsed + BigInt(actualSize) > tenant.storageQuotaBytes) {
		await deleteStorageObject(upload.objectKey).catch(() => {});
		await prisma.upload.update({
			where: { id: upload.id },
			data: { status: 'ABORTED' },
		});
		throw new HTTPException(413, {
			message: 'Tenant storage quota exceeded',
		});
	}

	const checksum = await resolveFileChecksum(
		upload.objectKey,
		actualSize,
		input.checksumSha256,
	);

	return finalizeUploadedObject({
		tenant,
		tenantMembership,
		userId,
		upload,
		actualSize,
		checksum,
		now,
	});
}

export async function abortUpload(
	tenantId: string,
	uploadId: string,
): Promise<UploadDTO> {
	const upload = await prisma.upload.findFirst({
		where: { id: uploadId, tenantId },
	});
	if (!upload) {
		throw new HTTPException(404, { message: 'Upload intent not found' });
	}

	if (upload.status === 'COMPLETED') {
		throw new HTTPException(409, {
			message: 'Cannot abort a completed upload',
		});
	}

	if (upload.isMultipart && upload.s3UploadId) {
		await abortS3MultipartUpload({
			key: upload.objectKey,
			uploadId: upload.s3UploadId,
		}).catch(() => {});
	}
	await deleteStorageObject(upload.objectKey).catch(() => {});

	const updated = await prisma.upload.update({
		where: { id: upload.id },
		data: { status: 'ABORTED' },
	});

	return serializeUpload(updated);
}

export async function initiateMultipartUpload(
	tenant: Tenant,
	tenantMembership: Pick<TenantMember, 'role'>,
	userId: string,
	input: {
		fileName: string;
		mimeType: string;
		sizeBytes: number;
		folderId?: string | null;
		fileId?: string | null;
		partSizeBytes: number;
	},
): Promise<{
	upload: UploadDTO;
	partSizeBytes: number;
	totalParts: number;
}> {
	const maxFileSize = getMaxFileSizeBytes();
	if (input.sizeBytes > maxFileSize) {
		throw new HTTPException(413, {
			message: `File exceeds maximum allowed size of ${maxFileSize} bytes`,
		});
	}

	let folderId = input.folderId ?? null;
	if (input.fileId) {
		const targetFile = await prisma.file.findFirst({
			where: { id: input.fileId, tenantId: tenant.id, deletedAt: null },
		});
		if (!targetFile) {
			throw new HTTPException(404, { message: 'Target file not found' });
		}
		await assertFileAccess(tenantMembership, targetFile, userId, 'EDITOR');
		folderId = targetFile.folderId;
	} else if (folderId) {
		const folder = await prisma.folder.findFirst({
			where: { id: folderId, tenantId: tenant.id, deletedAt: null },
			select: { id: true },
		});
		if (!folder) {
			throw new HTTPException(404, { message: 'Target folder not found' });
		}
	}

	const effectiveUsed = await getTenantEffectiveBytes(tenant.id);
	if (effectiveUsed + BigInt(input.sizeBytes) > tenant.storageQuotaBytes) {
		throw new HTTPException(413, {
			message: 'Tenant storage quota exceeded',
		});
	}

	const totalParts = Math.max(
		1,
		Math.ceil(input.sizeBytes / input.partSizeBytes),
	);
	const keySeed = input.fileId
		? `${input.fileId}-v-${randomUUID()}`
		: randomUUID();
	const objectKey = generateObjectKey(tenant.id, keySeed);
	const s3UploadId = await createS3MultipartUpload({
		key: objectKey,
		contentType: input.mimeType,
	});
	const expiresAt = new Date(Date.now() + MULTIPART_INTENT_TTL_MS);

	const upload = await prisma.upload.create({
		data: {
			tenantId: tenant.id,
			folderId,
			fileId: input.fileId ?? null,
			uploadedById: userId,
			fileName: input.fileName,
			mimeType: input.mimeType,
			declaredSizeBytes: BigInt(input.sizeBytes),
			objectKey,
			status: 'IN_PROGRESS',
			isMultipart: true,
			s3UploadId,
			partSizeBytes: input.partSizeBytes,
			totalParts,
			expiresAt,
		},
	});

	return {
		upload: serializeUpload(upload),
		partSizeBytes: input.partSizeBytes,
		totalParts,
	};
}

export async function getMultipartUploadState(
	tenantId: string,
	uploadId: string,
): Promise<{
	upload: UploadDTO;
	completedParts: UploadPartDTO[];
	remainingPartNumbers: number[];
}> {
	const upload = await prisma.upload.findFirst({
		where: { id: uploadId, tenantId, isMultipart: true },
		include: {
			parts: { orderBy: { partNumber: 'asc' } },
		},
	});
	if (!upload) {
		throw new HTTPException(404, { message: 'Multipart upload not found' });
	}

	const totalParts = upload.totalParts ?? 1;
	const completedSet = new Set(upload.parts.map((p) => p.partNumber));
	const remainingPartNumbers: number[] = [];
	for (let p = 1; p <= totalParts; p++) {
		if (!completedSet.has(p)) {
			remainingPartNumbers.push(p);
		}
	}

	return {
		upload: serializeUpload(upload),
		completedParts: upload.parts.map(serializeUploadPart),
		remainingPartNumbers,
	};
}

async function getActiveMultipartUpload(tenantId: string, uploadId: string) {
	const upload = await prisma.upload.findFirst({
		where: { id: uploadId, tenantId, isMultipart: true },
	});
	if (!upload?.s3UploadId) {
		throw new HTTPException(404, { message: 'Multipart upload not found' });
	}
	if (upload.status !== 'IN_PROGRESS' && upload.status !== 'PENDING') {
		throw new HTTPException(409, {
			message: `Upload is already ${upload.status.toLowerCase()}`,
		});
	}
	if (upload.expiresAt <= new Date()) {
		await abortS3MultipartUpload({
			key: upload.objectKey,
			uploadId: upload.s3UploadId,
		}).catch(() => {});
		await prisma.upload.update({
			where: { id: upload.id },
			data: { status: 'EXPIRED' },
		});
		throw new HTTPException(410, { message: 'Multipart upload has expired' });
	}
	return upload;
}

export async function createMultipartPartUrl(
	tenantId: string,
	uploadId: string,
	partNumber: number,
): Promise<{
	partNumber: number;
	uploadUrl: string;
	expiresInSeconds: number;
}> {
	const upload = await getActiveMultipartUpload(tenantId, uploadId);
	const totalParts = upload.totalParts ?? 1;
	if (partNumber < 1 || partNumber > totalParts) {
		throw new HTTPException(400, {
			message: `Part number must be between 1 and ${totalParts}`,
		});
	}

	const expiresInSeconds = PRESIGNED_PUT_TTL_SECONDS;
	const uploadUrl = await createPresignedPartUploadUrl({
		key: upload.objectKey,
		uploadId: upload.s3UploadId as string,
		partNumber,
		expiresInSeconds,
	});

	return { partNumber, uploadUrl, expiresInSeconds };
}

export async function recordMultipartPart(
	tenantId: string,
	uploadId: string,
	partNumber: number,
	input: { eTag: string; sizeBytes: number },
): Promise<{
	part: UploadPartDTO;
	completedCount: number;
	totalParts: number;
}> {
	const upload = await getActiveMultipartUpload(tenantId, uploadId);
	const totalParts = upload.totalParts ?? 1;
	if (partNumber < 1 || partNumber > totalParts) {
		throw new HTTPException(400, {
			message: `Part number must be between 1 and ${totalParts}`,
		});
	}

	const part = await prisma.uploadPart.upsert({
		where: { uploadId_partNumber: { uploadId: upload.id, partNumber } },
		create: {
			uploadId: upload.id,
			partNumber,
			eTag: input.eTag,
			sizeBytes: BigInt(input.sizeBytes),
		},
		update: {
			eTag: input.eTag,
			sizeBytes: BigInt(input.sizeBytes),
		},
	});

	const completedCount = await prisma.uploadPart.count({
		where: { uploadId: upload.id },
	});

	return {
		part: serializeUploadPart(part),
		completedCount,
		totalParts,
	};
}

export async function completeMultipartUpload(
	tenant: Tenant,
	tenantMembership: Pick<TenantMember, 'role'>,
	userId: string,
	uploadId: string,
	input: { checksumSha256?: string },
): Promise<{
	file: FileDTO;
	isDuplicate: boolean;
	duplicateOf: FileDTO[];
}> {
	const upload = await getActiveMultipartUpload(tenant.id, uploadId);
	const parts = await prisma.uploadPart.findMany({
		where: { uploadId: upload.id },
		orderBy: { partNumber: 'asc' },
	});

	const totalParts = upload.totalParts ?? 1;
	if (parts.length !== totalParts) {
		throw new HTTPException(400, {
			message: `Cannot complete multipart upload: received ${parts.length} of ${totalParts} parts`,
		});
	}

	await completeS3MultipartUpload({
		key: upload.objectKey,
		uploadId: upload.s3UploadId as string,
		parts: parts.map((p) => ({ partNumber: p.partNumber, eTag: p.eTag })),
	});

	const head = await headStorageObject(upload.objectKey);
	if (!head.exists) {
		throw new HTTPException(400, {
			message: 'Completed multipart object not found in storage',
		});
	}

	const actualSize = head.contentLength;
	const maxFileSize = getMaxFileSizeBytes();
	if (actualSize <= 0 || actualSize > maxFileSize) {
		await deleteStorageObject(upload.objectKey).catch(() => {});
		await prisma.upload.update({
			where: { id: upload.id },
			data: { status: 'ABORTED' },
		});
		throw new HTTPException(413, {
			message: `Uploaded object exceeds maximum allowed size of ${maxFileSize} bytes`,
		});
	}

	const storedUsed = await getTenantStoredBytes(tenant.id);
	if (storedUsed + BigInt(actualSize) > tenant.storageQuotaBytes) {
		await deleteStorageObject(upload.objectKey).catch(() => {});
		await prisma.upload.update({
			where: { id: upload.id },
			data: { status: 'ABORTED' },
		});
		throw new HTTPException(413, {
			message: 'Tenant storage quota exceeded',
		});
	}

	const checksum = await resolveFileChecksum(
		upload.objectKey,
		actualSize,
		input.checksumSha256,
	);

	return finalizeUploadedObject({
		tenant,
		tenantMembership,
		userId,
		upload,
		actualSize,
		checksum,
		now: new Date(),
	});
}
