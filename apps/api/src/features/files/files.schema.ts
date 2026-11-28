import { z } from 'zod';

const safeFileNameSchema = z
	.string()
	.trim()
	.min(1, 'File name is required')
	.max(255, 'File name must be 255 characters or fewer')
	.refine(
		(val) => !val.includes('/') && !val.includes('\\') && !val.includes('\0'),
		'File name contains invalid characters',
	);

export const FileIdParamSchema = z.object({
	fileId: z.string().uuid('Invalid file ID'),
});

export const ListFilesQuerySchema = z.object({
	folderId: z.union([z.string().uuid(), z.literal('root')]).optional(),
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(50),
	sortBy: z.enum(['name', 'sizeBytes', 'createdAt', 'updatedAt']).default('createdAt'),
	sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const UpdateFileSchema = z.object({
	name: safeFileNameSchema,
});

export const MoveFileSchema = z.object({
	targetFolderId: z.string().uuid('Invalid target folder ID').nullable(),
});

export const DownloadFileQuerySchema = z.object({
	disposition: z.enum(['attachment', 'inline']).default('attachment'),
});
