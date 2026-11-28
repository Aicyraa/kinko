import { z } from 'zod';

export const SearchQuerySchema = z.object({
	q: z.string().trim().max(120).optional(),
	type: z
		.enum(['all', 'image', 'pdf', 'text', 'audio', 'video', 'archive', 'other'])
		.default('all'),
	dateFrom: z.string().trim().optional(),
	dateTo: z.string().trim().optional(),
	minSize: z.coerce.number().int().min(0).optional(),
	maxSize: z.coerce.number().int().min(0).optional(),
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	sortBy: z
		.enum(['name', 'sizeBytes', 'createdAt', 'updatedAt'])
		.default('updatedAt'),
	sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type SearchQueryInput = z.infer<typeof SearchQuerySchema>;
