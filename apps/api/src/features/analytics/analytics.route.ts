import { Hono } from 'hono';
import type { AppEnv } from '../../types.ts';
import {
	fileTypesHandler,
	overviewHandler,
	storageHistoryHandler,
} from './analytics.controller.ts';

export const analytics = new Hono<AppEnv>()
	.get('/overview', ...overviewHandler)
	.get('/storage', ...storageHistoryHandler)
	.get('/file-types', ...fileTypesHandler);
