import { createFactory } from 'hono/factory';
import { requireAuth } from '../../middleware/requireAuth.ts';
import { requireTenant } from '../../middleware/requireTenant.ts';
import type { AppEnv } from '../../types.ts';
import { successResponse } from '../../utils/response.ts';
import { validate } from '../../utils/validate.ts';
import {
	CompleteUploadSchema,
	CreateUploadIntentSchema,
	UploadIdParamSchema,
} from './uploads.schema.ts';
import {
	abortUpload,
	completeUpload,
	createUploadIntent,
} from './uploads.service.ts';

const factory = createFactory<AppEnv>();

export const createUploadHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('json', CreateUploadIntentSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const user = c.get('user');
		const body = c.req.valid('json');
		const result = await createUploadIntent(tenant, user.id, body);
		return successResponse(c, 'Upload intent created', result, 201);
	},
);

export const completeUploadHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', UploadIdParamSchema),
	validate('json', CompleteUploadSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const user = c.get('user');
		const { uploadId } = c.req.valid('param');
		const body = c.req.valid('json');
		const result = await completeUpload(tenant, user.id, uploadId, body);
		return successResponse(c, 'Upload completed', result, 200);
	},
);

export const abortUploadHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', UploadIdParamSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const { uploadId } = c.req.valid('param');
		const upload = await abortUpload(tenant.id, uploadId);
		return successResponse(c, 'Upload aborted', { upload }, 200);
	},
);
