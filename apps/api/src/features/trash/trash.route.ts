import { Hono } from 'hono';
import type { AppEnv } from '../../types.ts';
import {
	cleanupTrashHandler,
	listTrashHandler,
	permanentDeleteTrashHandler,
	restoreTrashHandler,
} from './trash.controller.ts';

export const trash = new Hono<AppEnv>()
	.get('/', ...listTrashHandler)
	.post('/:itemId/restore', ...restoreTrashHandler)
	.delete('/:itemId', ...permanentDeleteTrashHandler)
	.post('/cleanup', ...cleanupTrashHandler);
