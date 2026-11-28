import { z } from 'zod';

const ACTIVITY_ACTIONS = [
	'FILE_UPLOADED',
	'FILE_DOWNLOADED',
	'FILE_RENAMED',
	'FILE_MOVED',
	'FILE_DELETED',
	'FILE_RESTORED',
	'FILE_PERMANENTLY_DELETED',
	'FILE_SHARED',
	'FILE_SHARE_REVOKED',
	'FILE_PERMISSION_UPDATED',
	'FILE_VERSION_CREATED',
	'FOLDER_CREATED',
	'FOLDER_RENAMED',
	'FOLDER_MOVED',
	'FOLDER_DELETED',
	'FOLDER_RESTORED',
	'FOLDER_PERMANENTLY_DELETED',
	'MEMBER_ADDED',
	'MEMBER_ROLE_UPDATED',
	'MEMBER_REMOVED',
] as const;

export const ListActivitiesQuerySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(15),
	action: z.enum(ACTIVITY_ACTIONS).optional(),
	targetType: z
		.enum(['FILE', 'FOLDER', 'TENANT', 'SHARE', 'MEMBER'])
		.optional(),
});
