import { createFactory } from 'hono/factory';
import { requireAuth } from '../../middleware/requireAuth.ts';
import { requireTenant } from '../../middleware/requireTenant.ts';
import type { AppEnv } from '../../types.ts';
import { errorResponse, successResponse } from '../../utils/response.ts';
import { validate } from '../../utils/validate.ts';
import {
	DownloadFileQuerySchema,
	FileIdParamSchema,
	ListFilesQuerySchema,
	MoveFileSchema,
	UpdateFileSchema,
} from './files.schema.ts';
import {
	createAuthorizedDownload,
	getFileById,
	listFiles,
	moveFile,
	renameFile,
	softDeleteFile,
} from './files.service.ts';

const factory = createFactory<AppEnv>();

export const listFilesHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('query', ListFilesQuerySchema),
	async (c) => {
		const tenant = c.get('tenant');
		const query = c.req.valid('query');
		const result = await listFiles(tenant.id, query);
		return successResponse(c, 'Files fetched', result, 200);
	},
);

export const getFileHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', FileIdParamSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const { fileId } = c.req.valid('param');
		const file = await getFileById(tenant.id, fileId);
		if (!file) {
			return errorResponse(c, 'File not found', {}, 404);
		}
		return successResponse(c, 'File fetched', { file }, 200);
	},
);

export const updateFileHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', FileIdParamSchema),
	validate('json', UpdateFileSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const user = c.get('user');
		const { fileId } = c.req.valid('param');
		const { name } = c.req.valid('json');
		const file = await renameFile(tenant.id, user.id, fileId, name);
		return successResponse(c, 'File updated', { file }, 200);
	},
);

export const moveFileHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', FileIdParamSchema),
	validate('json', MoveFileSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const user = c.get('user');
		const { fileId } = c.req.valid('param');
		const { targetFolderId } = c.req.valid('json');
		const file = await moveFile(tenant.id, user.id, fileId, targetFolderId);
		return successResponse(c, 'File moved', { file }, 200);
	},
);

export const deleteFileHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', FileIdParamSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const user = c.get('user');
		const { fileId } = c.req.valid('param');
		const file = await softDeleteFile(tenant.id, user.id, fileId);
		return successResponse(c, 'File moved to trash', { file }, 200);
	},
);

export const downloadFileHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', FileIdParamSchema),
	validate('query', DownloadFileQuerySchema),
	async (c) => {
		const tenant = c.get('tenant');
		const user = c.get('user');
		const { fileId } = c.req.valid('param');
		const { disposition } = c.req.valid('query');
		const result = await createAuthorizedDownload(
			tenant.id,
			user.id,
			fileId,
			disposition,
		);
		return successResponse(c, 'Download URL generated', result, 200);
	},
);
