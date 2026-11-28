import { z } from 'zod';

export const ShareFileParamSchema = z.object({
	fileId: z.string().uuid('Invalid file ID'),
});

export const ShareIdParamSchema = z.object({
	shareId: z.string().uuid('Invalid share ID'),
});

export const ShareTokenParamSchema = z.object({
	token: z.string().trim().min(10, 'Invalid share token').max(256),
});

export const CreateShareSchema = z.object({
	fileId: z.string().uuid('Invalid file ID'),
	password: z
		.string()
		.min(4, 'Password must be at least 4 characters')
		.max(128, 'Password is too long')
		.optional(),
	expiresInHours: z.coerce
		.number()
		.int()
		.min(1, 'Expiration must be at least 1 hour')
		.max(8760, 'Expiration cannot exceed 1 year')
		.nullable()
		.optional(),
});

export const AccessPublicShareSchema = z.object({
	password: z.string().max(128).optional(),
	disposition: z.enum(['attachment', 'inline']).default('attachment'),
});
