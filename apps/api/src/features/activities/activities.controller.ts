import { createFactory } from 'hono/factory';
import { requireAuth } from '../../middleware/requireAuth.ts';
import { requireTenant } from '../../middleware/requireTenant.ts';
import type { AppEnv } from '../../types.ts';
import { successResponse } from '../../utils/response.ts';
import { validate } from '../../utils/validate.ts';
import { ListActivitiesQuerySchema } from './activities.schema.ts';
import { listActivities } from './activities.service.ts';

const factory = createFactory<AppEnv>();

export const listActivitiesHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('query', ListActivitiesQuerySchema),
	async (c) => {
		const tenant = c.get('tenant');
		const query = c.req.valid('query');
		const data = await listActivities(tenant.id, query);
		return successResponse(c, 'Activities fetched', data, 200);
	},
);
