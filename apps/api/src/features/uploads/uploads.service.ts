import { randomUUID } from 'node:crypto';
import { HTTPException } from 'hono/http-exception';
import { getMaxFileSizeBytes } from '../../env.ts';
import type { Tenant } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.ts';
import {
	createPresignedUploadUrl,
	deleteStorageObject,
	generateObjectKey,
	headStorageObject,
} from '../../lib/storage.ts';
import {
	type FileDTO,
	serializeFile,
	serializeUpload,
	type UploadDTO,
} from '../../utils/serialize.ts';

const UPLOAD_INTENT_TTL_MS = 15 * 60_000;
const PRESIGNED_PUT_TTL_SECONDS = 300;

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
	userId: string,
	uploadId: string,
	input: { checksumSha256?: string },
): Promise<{ file: FileDTO }> {
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

	const checksum = input.checksumSha256?.toLowerCase() ?? null;

	const file = await prisma.$transaction(async (tx) => {
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

	return { file: serializeFile(file) };
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

	await deleteStorageObject(upload.objectKey).catch(() => {});

	const updated = await prisma.upload.update({
		where: { id: upload.id },
		data: { status: 'ABORTED' },
	});

	return serializeUpload(updated);
}
