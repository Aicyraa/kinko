import { z } from 'zod';

export const TrashItemParamSchema = z.object({
	itemId: z.string().uuid('Invalid trash item ID'),
});

export const RestoreTrashBodySchema = z
	.object({
		kind: z.enum(['file', 'folder']).optional(),
	})
	.optional();
