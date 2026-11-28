import { z } from 'zod';

export const FilePermissionParamSchema = z.object({
	fileId: z.string().uuid('Invalid file ID'),
});

export const FilePermissionUserParamSchema = z.object({
	fileId: z.string().uuid('Invalid file ID'),
	userId: z.string().uuid('Invalid user ID'),
});

export const UpsertFilePermissionSchema = z.object({
	userId: z.string().uuid('Invalid user ID'),
	role: z.enum(['VIEWER', 'EDITOR', 'OWNER']),
});
