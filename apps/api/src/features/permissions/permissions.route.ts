import { Hono } from 'hono';
import type { AppEnv } from '../../types.ts';
import {
	listFilePermissionsHandler,
	removeFilePermissionHandler,
	upsertFilePermissionHandler,
} from './permissions.controller.ts';

export const permissions = new Hono<AppEnv>()
	.get('/file/:fileId', ...listFilePermissionsHandler)
	.put('/file/:fileId', ...upsertFilePermissionHandler)
	.delete('/file/:fileId/:userId', ...removeFilePermissionHandler);
