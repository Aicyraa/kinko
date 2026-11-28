import { z } from 'zod';

export const AddFavoriteSchema = z.object({
	targetType: z.enum(['FILE', 'FOLDER']),
	targetId: z.string().uuid('Invalid target ID'),
});

export const RemoveFavoriteParamSchema = z.object({
	targetType: z
		.string()
		.transform((val) => val.toUpperCase())
		.pipe(z.enum(['FILE', 'FOLDER'])),
	targetId: z.string().uuid('Invalid target ID'),
});
