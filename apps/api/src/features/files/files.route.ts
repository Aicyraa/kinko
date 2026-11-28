import { Hono } from 'hono';
import type { AppEnv } from '../../types.ts';
import {
	deleteFileHandler,
	downloadFileHandler,
	getFileHandler,
	listFilesHandler,
	moveFileHandler,
	updateFileHandler,
} from './files.controller.ts';

export const files = new Hono<AppEnv>()
	.get('/', ...listFilesHandler)
	.get('/:fileId', ...getFileHandler)
	.patch('/:fileId', ...updateFileHandler)
	.post('/:fileId/move', ...moveFileHandler)
	.delete('/:fileId', ...deleteFileHandler)
	.get('/:fileId/download', ...downloadFileHandler);
