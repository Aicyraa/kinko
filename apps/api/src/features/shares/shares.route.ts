import { Hono } from 'hono';
import type { AppEnv } from '../../types.ts';
import {
	accessPublicShareHandler,
	createShareHandler,
	getPublicShareHandler,
	listFileSharesHandler,
	revokeShareHandler,
} from './shares.controller.ts';

export const shares = new Hono<AppEnv>()
	.get('/public/:token', ...getPublicShareHandler)
	.post('/public/:token/access', ...accessPublicShareHandler)
	.get('/file/:fileId', ...listFileSharesHandler)
	.post('/', ...createShareHandler)
	.delete('/:shareId', ...revokeShareHandler);
