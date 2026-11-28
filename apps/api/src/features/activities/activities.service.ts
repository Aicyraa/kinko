import { prisma } from '../../lib/prisma.ts';

export interface ActivityDTO {
	id: string;
	tenantId: string;
	actorId: string | null;
	action: string;
	targetType: string;
	fileId: string | null;
	folderId: string | null;
	targetName: string | null;
	createdAt: string;
}

export async function listActivities(
	tenantId: string,
	options: { page: number; limit: number },
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
	const where = { tenantId };

	const [rows, total] = await Promise.all([
		prisma.activity.findMany({
			where,
			orderBy: { createdAt: 'desc' },
			skip,
			take: options.limit,
		}),
		prisma.activity.count({ where }),
	]);

	return {
		items: rows.map((row) => ({
			id: row.id,
			tenantId: row.tenantId,
			actorId: row.actorId,
			action: row.action,
			targetType: row.targetType,
			fileId: row.fileId,
			folderId: row.folderId,
			targetName: row.targetName,
			createdAt: row.createdAt.toISOString(),
		})),
		pagination: {
			page: options.page,
			limit: options.limit,
			total,
			totalPages: Math.max(1, Math.ceil(total / options.limit)),
		},
	};
}
