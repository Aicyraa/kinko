import { createFactory } from 'hono/factory';
import { requireAuth } from '../../middleware/requireAuth.ts';
import { requireTenant } from '../../middleware/requireTenant.ts';
import type { AppEnv } from '../../types.ts';
import { successResponse } from '../../utils/response.ts';
import { validate } from '../../utils/validate.ts';
import {
	CompleteUploadSchema,
	CreateUploadIntentSchema,
	InitiateMultipartUploadSchema,
	RecordUploadPartSchema,
	UploadIdParamSchema,
	UploadPartParamSchema,
} from './uploads.schema.ts';
import {
	abortUpload,
	completeMultipartUpload,
	completeUpload,
	createMultipartPartUrl,
	createUploadIntent,
	getMultipartUploadState,
	initiateMultipartUpload,
	recordMultipartPart,
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
		const membership = c.get('tenantMembership');
		const user = c.get('user');
		const { uploadId } = c.req.valid('param');
		const body = c.req.valid('json');
		const result = await completeUpload(
			tenant,
			membership,
			user.id,
			uploadId,
			body,
		);
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

export const initiateMultipartHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('json', InitiateMultipartUploadSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const membership = c.get('tenantMembership');
		const user = c.get('user');
		const body = c.req.valid('json');
		const result = await initiateMultipartUpload(
			tenant,
			membership,
			user.id,
			body,
		);
		return successResponse(c, 'Multipart upload initiated', result, 201);
	},
);

export const getMultipartStateHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', UploadIdParamSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const { uploadId } = c.req.valid('param');
		const result = await getMultipartUploadState(tenant.id, uploadId);
		return successResponse(c, 'Multipart upload state fetched', result, 200);
	},
);

export const createMultipartPartUrlHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', UploadPartParamSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const { uploadId, partNumber } = c.req.valid('param');
		const result = await createMultipartPartUrl(
			tenant.id,
			uploadId,
			partNumber,
		);
		return successResponse(c, 'Multipart part URL generated', result, 200);
	},
);

export const recordMultipartPartHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', UploadPartParamSchema),
	validate('json', RecordUploadPartSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const { uploadId, partNumber } = c.req.valid('param');
		const body = c.req.valid('json');
		const result = await recordMultipartPart(
			tenant.id,
			uploadId,
			partNumber,
			body,
		);
		return successResponse(c, 'Multipart part recorded', result, 200);
	},
);

export const completeMultipartHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('param', UploadIdParamSchema),
	validate('json', CompleteUploadSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const membership = c.get('tenantMembership');
		const user = c.get('user');
		const { uploadId } = c.req.valid('param');
		const body = c.req.valid('json');
		const result = await completeMultipartUpload(
			tenant,
			membership,
			user.id,
			uploadId,
			body,
		);
		return successResponse(c, 'Multipart upload completed', result, 200);
	},
);
