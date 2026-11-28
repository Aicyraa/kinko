import { z } from 'zod';

export const TenantIdParamSchema = z.object({
	tenantId: z.string().uuid('Invalid tenant ID'),
});

export const CreateTenantSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, 'Workspace name is required')
		.max(80, 'Workspace name must be 80 characters or fewer'),
});

export const UpdateTenantSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, 'Workspace name is required')
		.max(80, 'Workspace name must be 80 characters or fewer'),
});

export type CreateTenantInput = z.infer<typeof CreateTenantSchema>;
export type UpdateTenantInput = z.infer<typeof UpdateTenantSchema>;
