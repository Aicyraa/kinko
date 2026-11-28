import { createFactory } from 'hono/factory';
import { requireAuth } from '../../middleware/requireAuth.ts';
import { requireTenant } from '../../middleware/requireTenant.ts';
import type { AppEnv } from '../../types.ts';
import { errorResponse, successResponse } from '../../utils/response.ts';
import { validate } from '../../utils/validate.ts';
import {
	CreateFolderSchema,
	FolderIdParamSchema,
	ListFoldersQuerySchema,
	MoveFolderSchema,
	UpdateFolderSchema,
} from './folder.schema.ts';
import {
	createFolder,
	getFolderDetails,
	listFolders,
	moveFolder,
	renameFolder,
	softDeleteFolder,
} from './folder.service.ts';

const factory = createFactory<AppEnv>();

export const listFoldersHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('query', ListFoldersQuerySchema),
	async (c) => {
		const tenant = c.get('tenant');
		const query = c.req.valid('query');
		const folders = await listFolders(tenant.id, query);
		return successResponse(c, 'Folders fetched', { folders }, 200);
	},
);

export const getFolderHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', FolderIdParamSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const { folderId } = c.req.valid('param');
		const details = await getFolderDetails(tenant.id, folderId);

		if (!details) {
			return errorResponse(c, 'Folder not found', {}, 404);
		}

		return successResponse(c, 'Folder fetched', details, 200);
	},
);

export const createFolderHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('json', CreateFolderSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const user = c.get('user');
		const body = c.req.valid('json');
		const folder = await createFolder(tenant.id, user.id, body);
		return successResponse(c, 'Folder created', { folder }, 201);
	},
);

export const updateFolderHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', FolderIdParamSchema),
	validate('json', UpdateFolderSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const user = c.get('user');
		const { folderId } = c.req.valid('param');
		const { name } = c.req.valid('json');
		const folder = await renameFolder(tenant.id, user.id, folderId, name);
		return successResponse(c, 'Folder updated', { folder }, 200);
	},
);

export const moveFolderHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', FolderIdParamSchema),
	validate('json', MoveFolderSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const user = c.get('user');
		const { folderId } = c.req.valid('param');
		const { targetParentFolderId } = c.req.valid('json');
		const folder = await moveFolder(
			tenant.id,
			user.id,
			folderId,
			targetParentFolderId,
		);
		return successResponse(c, 'Folder moved', { folder }, 200);
	},
);

export const deleteFolderHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', FolderIdParamSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const user = c.get('user');
		const { folderId } = c.req.valid('param');
		const result = await softDeleteFolder(tenant.id, user.id, folderId);
		return successResponse(c, 'Folder moved to trash', result, 200);
	},
);
