import type {
	ActivityAction,
	ActivityTargetType,
} from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.ts';
import { lookupAuthUsers } from '../permissions/permissions.service.ts';

const SENSITIVE_META_KEY =
	/token|password|secret|authorization|cookie|uploadurl|downloadurl|content|body/i;

export function sanitizeActivityMetadata(
	meta: unknown,
): Record<string, unknown> | null {
	if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
		return null;
	}
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(meta)) {
		if (SENSITIVE_META_KEY.test(key)) {
			continue;
		}
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			out[key] = sanitizeActivityMetadata(value);
		} else {
			out[key] = value;
		}
	}
	return out;
}

export interface ActivityDTO {
	id: string;
	tenantId: string;
	actorId: string | null;
	actorName: string | null;
	actorEmail: string | null;
	action: string;
	targetType: string;
	fileId: string | null;
	folderId: string | null;
	targetName: string | null;
	metadata: Record<string, unknown> | null;
	createdAt: string;
}

export async function listActivities(
	tenantId: string,
	options: {
		page: number;
		limit: number;
		action?: ActivityAction;
		targetType?: ActivityTargetType;
	},
): Promise<{
	items: ActivityDTO[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
}> {
	const skip = (options.page - 1) * options.limit;
	const where = {
		tenantId,
		...(options.action ? { action: options.action } : {}),
		...(options.targetType ? { targetType: options.targetType } : {}),
	};

	const [rows, total] = await Promise.all([
		prisma.activity.findMany({
			where,
			orderBy: { createdAt: 'desc' },
			skip,
			take: options.limit,
		}),
		prisma.activity.count({ where }),
	]);

	const actorIds = rows
		.map((r) => r.actorId)
		.filter((id): id is string => Boolean(id));
	const actorMap = await lookupAuthUsers(actorIds);

	return {
		items: rows.map((row) => {
			const actor = row.actorId ? actorMap.get(row.actorId) : undefined;
			return {
				id: row.id,
				tenantId: row.tenantId,
				actorId: row.actorId,
				actorName: actor?.name ?? null,
				actorEmail: actor?.email ?? null,
				action: row.action,
				targetType: row.targetType,
				fileId: row.fileId,
				folderId: row.folderId,
				targetName: row.targetName,
				metadata: sanitizeActivityMetadata(row.metadata),
				createdAt: row.createdAt.toISOString(),
			};
		}),
		pagination: {
			page: options.page,
			limit: options.limit,
			total,
			totalPages: Math.max(1, Math.ceil(total / options.limit)),
		},
	};
}
