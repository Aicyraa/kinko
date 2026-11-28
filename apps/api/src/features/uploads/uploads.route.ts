import { Hono } from 'hono';
import type { AppEnv } from '../../types.ts';
import {
	abortUploadHandler,
	completeUploadHandler,
	createUploadHandler,
} from './uploads.controller.ts';

export const uploads = new Hono<AppEnv>()
	.post('/', ...createUploadHandler)
	.post('/:uploadId/complete', ...completeUploadHandler)
	.delete('/:uploadId', ...abortUploadHandler);
