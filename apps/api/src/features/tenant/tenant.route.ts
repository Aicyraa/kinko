import { Hono } from 'hono';
import type { AppEnv } from '../../types.ts';
import {
	createTenantHandler,
	getTenantHandler,
	listMembersHandler,
	listTenants,
	setDefaultTenantHandler,
	updateTenantHandler,
} from './tenant.controller.ts';

export const tenant = new Hono<AppEnv>()
	.get('/', ...listTenants)
	.post('/', ...createTenantHandler)
	.get('/:tenantId', ...getTenantHandler)
	.patch('/:tenantId', ...updateTenantHandler)
	.post('/:tenantId/default', ...setDefaultTenantHandler)
	.get('/:tenantId/members', ...listMembersHandler);
