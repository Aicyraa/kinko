import { createFactory } from 'hono/factory';
import { requireAuth } from '../../middleware/requireAuth.ts';
import { requireTenant } from '../../middleware/requireTenant.ts';
import type { AppEnv } from '../../types.ts';
import { errorResponse, successResponse } from '../../utils/response.ts';
import { validate } from '../../utils/validate.ts';
import {
	CreateFileVersionSchema,
	DownloadFileQuerySchema,
	FileIdParamSchema,
	FileVersionParamSchema,
	ListFilesQuerySchema,
	MoveFileSchema,
	UpdateFileSchema,
} from './files.schema.ts';
import {
	createAuthorizedDownload,
	createFileVersionUploadIntent,
	downloadFileVersion,
	getFileById,
	listDuplicateFiles,
	listFiles,
	listFileVersions,
	moveFile,
	renameFile,
	restoreFileVersion,
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

export const listDuplicatesHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	async (c) => {
		const tenant = c.get('tenant');
		const result = await listDuplicateFiles(tenant.id);
		return successResponse(c, 'Duplicate files fetched', result, 200);
	},
);

export const getFileHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', FileIdParamSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const membership = c.get('tenantMembership');
		const user = c.get('user');
		const { fileId } = c.req.valid('param');
		const file = await getFileById(tenant.id, membership, user.id, fileId);
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
		const membership = c.get('tenantMembership');
		const user = c.get('user');
		const { fileId } = c.req.valid('param');
		const { name } = c.req.valid('json');
		const file = await renameFile(tenant.id, membership, user.id, fileId, name);
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
		const membership = c.get('tenantMembership');
		const user = c.get('user');
		const { fileId } = c.req.valid('param');
		const { targetFolderId } = c.req.valid('json');
		const file = await moveFile(
			tenant.id,
			membership,
			user.id,
			fileId,
			targetFolderId,
		);
		return successResponse(c, 'File moved', { file }, 200);
	},
);

export const deleteFileHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', FileIdParamSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const membership = c.get('tenantMembership');
		const user = c.get('user');
		const { fileId } = c.req.valid('param');
		const file = await softDeleteFile(tenant.id, membership, user.id, fileId);
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
		const membership = c.get('tenantMembership');
		const user = c.get('user');
		const { fileId } = c.req.valid('param');
		const { disposition } = c.req.valid('query');
		const result = await createAuthorizedDownload(
			tenant.id,
			membership,
			user.id,
			fileId,
			disposition,
		);
		return successResponse(c, 'Download URL generated', result, 200);
	},
);

export const listFileVersionsHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', FileIdParamSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const membership = c.get('tenantMembership');
		const user = c.get('user');
		const { fileId } = c.req.valid('param');
		const result = await listFileVersions(
			tenant.id,
			membership,
			user.id,
			fileId,
		);
		return successResponse(c, 'File versions fetched', result, 200);
	},
);

export const createFileVersionHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', FileIdParamSchema),
	validate('json', CreateFileVersionSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const membership = c.get('tenantMembership');
		const user = c.get('user');
		const { fileId } = c.req.valid('param');
		const body = c.req.valid('json');
		const result = await createFileVersionUploadIntent(
			tenant,
			membership,
			user.id,
			fileId,
			body,
		);
		return successResponse(c, 'Version upload intent created', result, 201);
	},
);

export const downloadFileVersionHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', FileVersionParamSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const membership = c.get('tenantMembership');
		const user = c.get('user');
		const { fileId, versionId } = c.req.valid('param');
		const result = await downloadFileVersion(
			tenant.id,
			membership,
			user.id,
			fileId,
			versionId,
		);
		return successResponse(c, 'Version download URL generated', result, 200);
	},
);

export const restoreFileVersionHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', FileVersionParamSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const membership = c.get('tenantMembership');
		const user = c.get('user');
		const { fileId, versionId } = c.req.valid('param');
		const result = await restoreFileVersion(
			tenant.id,
			membership,
			user.id,
			fileId,
			versionId,
		);
		return successResponse(c, 'File version restored', result, 200);
	},
);
