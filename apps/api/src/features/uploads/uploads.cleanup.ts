import { logger } from '../../lib/logger.ts';
import { prisma } from '../../lib/prisma.ts';
import {
	abortS3MultipartUpload,
	deleteStorageObject,
} from '../../lib/storage.ts';

export async function cleanupExpiredUploads(options?: {
	tenantId?: string;
}): Promise<{
	expiredCount: number;
	cleanedMultipartCount: number;
	cleanedObjectsCount: number;
}> {
	const now = new Date();
	const expiredUploads = await prisma.upload.findMany({
		where: {
			...(options?.tenantId ? { tenantId: options.tenantId } : {}),
			status: { in: ['PENDING', 'IN_PROGRESS'] },
			expiresAt: { lte: now },
		},
		select: {
			id: true,
			objectKey: true,
			isMultipart: true,
			s3UploadId: true,
		},
	});

	let cleanedMultipartCount = 0;
	let cleanedObjectsCount = 0;

	for (const upload of expiredUploads) {
		if (upload.isMultipart && upload.s3UploadId) {
			await abortS3MultipartUpload({
				key: upload.objectKey,
				uploadId: upload.s3UploadId,
			})
				.then(() => {
					cleanedMultipartCount += 1;
				})
				.catch(() => {});
		}

		await deleteStorageObject(upload.objectKey)
			.then(() => {
				cleanedObjectsCount += 1;
			})
			.catch(() => {});

		await prisma.upload.update({
			where: { id: upload.id },
			data: { status: 'EXPIRED' },
		});
	}

	logger.info(
		{
			expiredCount: expiredUploads.length,
			cleanedMultipartCount,
			cleanedObjectsCount,
		},
		'expired upload cleanup completed',
	);

	return {
		expiredCount: expiredUploads.length,
		cleanedMultipartCount,
		cleanedObjectsCount,
	};
}
