import { Hono } from 'hono';
import type { AppEnv } from '../../types.ts';
import {
	addFavoriteHandler,
	listFavoritesHandler,
	removeFavoriteHandler,
} from './favorites.controller.ts';

export const favorites = new Hono<AppEnv>()
	.get('/', ...listFavoritesHandler)
	.post('/', ...addFavoriteHandler)
	.delete('/:targetType/:targetId', ...removeFavoriteHandler);
