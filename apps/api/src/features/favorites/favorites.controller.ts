import { createFactory } from 'hono/factory';
import { requireAuth } from '../../middleware/requireAuth.ts';
import { requireTenant } from '../../middleware/requireTenant.ts';
import type { AppEnv } from '../../types.ts';
import { successResponse } from '../../utils/response.ts';
import { validate } from '../../utils/validate.ts';
import {
	AddFavoriteSchema,
	RemoveFavoriteParamSchema,
} from './favorites.schema.ts';
import {
	addFavorite,
	listFavorites,
	removeFavorite,
} from './favorites.service.ts';

const factory = createFactory<AppEnv>();

export const listFavoritesHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	async (c) => {
		const tenant = c.get('tenant');
		const user = c.get('user');
		const data = await listFavorites(tenant.id, user.id);
		return successResponse(c, 'Favorites fetched', data, 200);
	},
);

export const addFavoriteHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('json', AddFavoriteSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const membership = c.get('tenantMembership');
		const user = c.get('user');
		const { targetType, targetId } = c.req.valid('json');
		const favorite = await addFavorite(
			tenant.id,
			membership,
			user.id,
			targetType,
			targetId,
		);
		return successResponse(c, 'Added to favorites', { favorite }, 201);
	},
);

export const removeFavoriteHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', RemoveFavoriteParamSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const user = c.get('user');
		const { targetType, targetId } = c.req.valid('param');
		const result = await removeFavorite(
			tenant.id,
			user.id,
			targetType,
			targetId,
		);
		return successResponse(c, 'Removed from favorites', result, 200);
	},
);
