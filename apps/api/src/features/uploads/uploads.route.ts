import { Hono } from 'hono';
import type { AppEnv } from '../../types.ts';
import {
	abortUploadHandler,
	completeMultipartHandler,
	completeUploadHandler,
	createMultipartPartUrlHandler,
	createUploadHandler,
	getMultipartStateHandler,
	initiateMultipartHandler,
	recordMultipartPartHandler,
} from './uploads.controller.ts';

export const uploads = new Hono<AppEnv>()
	.post('/multipart', ...initiateMultipartHandler)
	.get('/multipart/:uploadId', ...getMultipartStateHandler)
	.post(
		'/multipart/:uploadId/parts/:partNumber/url',
		...createMultipartPartUrlHandler,
	)
	.post(
		'/multipart/:uploadId/parts/:partNumber',
		...recordMultipartPartHandler,
	)
	.post('/multipart/:uploadId/complete', ...completeMultipartHandler)
	.delete('/multipart/:uploadId', ...abortUploadHandler)
	.post('/', ...createUploadHandler)
	.post('/:uploadId/complete', ...completeUploadHandler)
	.delete('/:uploadId', ...abortUploadHandler);
