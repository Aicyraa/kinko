import { z } from 'zod';

const safeNameSchema = z
	.string()
	.trim()
	.min(1, 'Folder name is required')
	.max(120, 'Folder name must be 120 characters or fewer')
	.refine(
		(val) => !val.includes('/') && !val.includes('\\') && !val.includes('\0') && val !== '.' && val !== '..',
		'Folder name contains invalid characters',
	);

export const FolderIdParamSchema = z.object({
	folderId: z.string().uuid('Invalid folder ID'),
});

export const ListFoldersQuerySchema = z.object({
	parentFolderId: z
		.union([z.string().uuid(), z.literal('root')])
		.optional(),
	sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('name'),
	sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const CreateFolderSchema = z.object({
	name: safeNameSchema,
	parentFolderId: z.string().uuid('Invalid parent folder ID').nullable().optional(),
});

export const UpdateFolderSchema = z.object({
	name: safeNameSchema,
});

export const MoveFolderSchema = z.object({
	targetParentFolderId: z.string().uuid('Invalid target folder ID').nullable(),
});
