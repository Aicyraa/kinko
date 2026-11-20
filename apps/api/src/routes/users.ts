import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const createUserSchema = z.object({
	email: z.email(),
	name: z.string().trim().min(1).max(100).optional(),
});

export const users = new Hono()
	.get('/', async (c) => {
		const allUsers = await prisma.user.findMany({
			orderBy: { createdAt: 'desc' },
		});
		return c.json(allUsers);
	})
	.post(
		'/',
		zValidator('json', createUserSchema, (result, c) => {
			if (!result.success) {
				return c.json(
					{ error: 'Validation failed', issues: result.error.issues },
					400,
				);
			}
		}),
		async (c) => {
			const user = await prisma.user.create({ data: c.req.valid('json') });
			return c.json(user, 201);
		},
	);
