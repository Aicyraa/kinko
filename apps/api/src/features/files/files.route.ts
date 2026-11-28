import { Hono } from 'hono';
import type { AppEnv } from '../../types.ts';
import {
	createFileVersionHandler,
	deleteFileHandler,
	downloadFileHandler,
	downloadFileVersionHandler,
	getFileHandler,
	listDuplicatesHandler,
	listFilesHandler,
	listFileVersionsHandler,
	moveFileHandler,
	restoreFileVersionHandler,
	updateFileHandler,
} from './files.controller.ts';

export const files = new Hono<AppEnv>()
	.get('/', ...listFilesHandler)
	.get('/duplicates', ...listDuplicatesHandler)
	.get('/:fileId', ...getFileHandler)
	.patch('/:fileId', ...updateFileHandler)
	.post('/:fileId/move', ...moveFileHandler)
	.delete('/:fileId', ...deleteFileHandler)
	.get('/:fileId/download', ...downloadFileHandler)
	.get('/:fileId/versions', ...listFileVersionsHandler)
	.post('/:fileId/versions', ...createFileVersionHandler)
	.get('/:fileId/versions/:versionId/download', ...downloadFileVersionHandler)
	.post('/:fileId/versions/:versionId/restore', ...restoreFileVersionHandler);
