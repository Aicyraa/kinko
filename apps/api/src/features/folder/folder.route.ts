import { Hono } from 'hono';
import type { AppEnv } from '../../types.ts';
import {
	createFolderHandler,
	deleteFolderHandler,
	getFolderHandler,
	listFoldersHandler,
	moveFolderHandler,
	updateFolderHandler,
} from './folder.controller.ts';

export const folder = new Hono<AppEnv>()
	.get('/', ...listFoldersHandler)
	.post('/', ...createFolderHandler)
	.get('/:folderId', ...getFolderHandler)
	.patch('/:folderId', ...updateFolderHandler)
	.post('/:folderId/move', ...moveFolderHandler)
	.delete('/:folderId', ...deleteFolderHandler);
