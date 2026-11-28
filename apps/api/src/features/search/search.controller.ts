import { createFactory } from 'hono/factory';
import { requireAuth } from '../../middleware/requireAuth.ts';
import { requireTenant } from '../../middleware/requireTenant.ts';
import type { AppEnv } from '../../types.ts';
import { successResponse } from '../../utils/response.ts';
import { validate } from '../../utils/validate.ts';
import { SearchQuerySchema } from './search.schema.ts';
import { searchFiles } from './search.service.ts';

const factory = createFactory<AppEnv>();

export const searchHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('query', SearchQuerySchema),
	async (c) => {
		const tenant = c.get('tenant');
		const query = c.req.valid('query');
		const result = await searchFiles(tenant.id, query);
		return successResponse(c, 'Search results fetched', result, 200);
	},
);
