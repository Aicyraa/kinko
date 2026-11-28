import { createFactory } from 'hono/factory';
import { requireAuth } from '../../middleware/requireAuth.ts';
import { requireTenant } from '../../middleware/requireTenant.ts';
import type { AppEnv } from '../../types.ts';
import { successResponse } from '../../utils/response.ts';
import { validate } from '../../utils/validate.ts';
import { StorageHistoryQuerySchema } from './analytics.schema.ts';
import {
	getAnalyticsOverview,
	getFileTypeDistribution,
	getStorageHistory,
} from './analytics.service.ts';

const factory = createFactory<AppEnv>();

export const overviewHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	async (c) => {
		const tenant = c.get('tenant');
		const data = await getAnalyticsOverview(tenant);
		return successResponse(c, 'Analytics overview fetched', data, 200);
	},
);

export const storageHistoryHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('query', StorageHistoryQuerySchema),
	async (c) => {
		const tenant = c.get('tenant');
		const { days } = c.req.valid('query');
		const data = await getStorageHistory(tenant, days);
		return successResponse(c, 'Storage history fetched', data, 200);
	},
);

export const fileTypesHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	async (c) => {
		const tenant = c.get('tenant');
		const data = await getFileTypeDistribution(tenant.id);
		return successResponse(c, 'File type distribution fetched', data, 200);
	},
);
