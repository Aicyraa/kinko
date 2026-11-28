import { z } from 'zod';

const safeFileNameSchema = z
	.string()
	.trim()
	.min(1, 'File name is required')
	.max(255, 'File name is too long')
	.refine(
		(val) => !val.includes('/') && !val.includes('\\') && !val.includes('\0'),
		'File name contains invalid characters',
	);

export const UploadIdParamSchema = z.object({
	uploadId: z.string().uuid('Invalid upload ID'),
});

export const UploadPartParamSchema = z.object({
	uploadId: z.string().uuid('Invalid upload ID'),
	partNumber: z.coerce.number().int().min(1).max(10000),
});

export const CreateUploadIntentSchema = z.object({
	fileName: safeFileNameSchema,
	mimeType: z
		.string()
		.trim()
		.min(1, 'MIME type is required')
		.max(150, 'MIME type is too long')
		.default('application/octet-stream'),
	sizeBytes: z.coerce
		.number()
		.int('Size must be an integer')
		.positive('File size must be greater than 0'),
	folderId: z.string().uuid('Invalid folder ID').nullable().optional(),
});

export const CompleteUploadSchema = z.object({
	checksumSha256: z
		.string()
		.trim()
		.regex(/^[a-fA-F0-9]{64}$/, 'Invalid SHA-256 hex digest')
		.optional(),
});

export const InitiateMultipartUploadSchema = z.object({
	fileName: safeFileNameSchema,
	mimeType: z
		.string()
		.trim()
		.min(1, 'MIME type is required')
		.max(150, 'MIME type is too long')
		.default('application/octet-stream'),
	sizeBytes: z.coerce
		.number()
		.int('Size must be an integer')
		.positive('File size must be greater than 0'),
	folderId: z.string().uuid('Invalid folder ID').nullable().optional(),
	fileId: z.string().uuid('Invalid file ID').nullable().optional(),
	partSizeBytes: z.coerce
		.number()
		.int()
		.min(5 * 1024 * 1024, 'Part size must be at least 5 MB')
		.max(100 * 1024 * 1024, 'Part size cannot exceed 100 MB')
		.default(5 * 1024 * 1024),
});

export const RecordUploadPartSchema = z.object({
	eTag: z.string().trim().min(1, 'ETag is required').max(255),
	sizeBytes: z.coerce.number().int().positive('Part size must be positive'),
});
