import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.ts';
import { type FileDTO, serializeFile } from '../../utils/serialize.ts';
import type { SearchQueryInput } from './search.schema.ts';

function buildTypeFilter(
	type: SearchQueryInput['type'],
): Prisma.FileWhereInput | undefined {
	switch (type) {
		case 'all':
			return undefined;
		case 'image':
			return { mimeType: { startsWith: 'image/' } };
		case 'pdf':
			return { mimeType: 'application/pdf' };
		case 'text':
			return {
				OR: [
					{ mimeType: { startsWith: 'text/' } },
					{ mimeType: { contains: 'json' } },
					{ mimeType: { contains: 'sql' } },
					{ mimeType: { contains: 'xml' } },
					{ mimeType: { contains: 'javascript' } },
				],
			};
		case 'audio':
			return { mimeType: { startsWith: 'audio/' } };
		case 'video':
			return { mimeType: { startsWith: 'video/' } };
		case 'archive':
			return {
				OR: [
					{ mimeType: { contains: 'zip' } },
					{ mimeType: { contains: 'tar' } },
					{ mimeType: { contains: 'gzip' } },
				],
			};
		case 'other':
			return {
				NOT: {
					OR: [
						{ mimeType: { startsWith: 'image/' } },
						{ mimeType: 'application/pdf' },
						{ mimeType: { startsWith: 'text/' } },
						{ mimeType: { contains: 'json' } },
						{ mimeType: { contains: 'sql' } },
						{ mimeType: { startsWith: 'audio/' } },
						{ mimeType: { startsWith: 'video/' } },
						{ mimeType: { contains: 'zip' } },
						{ mimeType: { contains: 'tar' } },
						{ mimeType: { contains: 'gzip' } },
					],
				},
			};
	}
}

function parseDateBound(
	raw: string | undefined,
	endOfDay: boolean,
): Date | undefined {
	if (!raw) return undefined;
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
		return new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
	}
	const parsed = new Date(raw);
	return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export async function searchFiles(
	tenantId: string,
	query: SearchQueryInput,
): Promise<{
	items: FileDTO[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
}> {
	const andClauses: Prisma.FileWhereInput[] = [
		{ tenantId },
		{ deletedAt: null },
	];

	if (query.q && query.q.length > 0) {
		andClauses.push({
			name: { contains: query.q, mode: 'insensitive' },
		});
	}

	const typeFilter = buildTypeFilter(query.type);
	if (typeFilter) {
		andClauses.push(typeFilter);
	}

	const gteDate = parseDateBound(query.dateFrom, false);
	const lteDate = parseDateBound(query.dateTo, true);
	if (gteDate || lteDate) {
		andClauses.push({
			createdAt: {
				...(gteDate ? { gte: gteDate } : {}),
				...(lteDate ? { lte: lteDate } : {}),
			},
		});
	}

	if (query.minSize !== undefined || query.maxSize !== undefined) {
		andClauses.push({
			sizeBytes: {
				...(query.minSize !== undefined
					? { gte: BigInt(query.minSize) }
					: {}),
				...(query.maxSize !== undefined
					? { lte: BigInt(query.maxSize) }
					: {}),
			},
		});
	}

	const where: Prisma.FileWhereInput = { AND: andClauses };
	const skip = (query.page - 1) * query.limit;

	const [items, total] = await Promise.all([
		prisma.file.findMany({
			where,
			orderBy: { [query.sortBy]: query.sortOrder },
			skip,
			take: query.limit,
		}),
		prisma.file.count({ where }),
	]);

	return {
		items: items.map(serializeFile),
		pagination: {
			page: query.page,
			limit: query.limit,
			total,
			totalPages: Math.max(1, Math.ceil(total / query.limit)),
		},
	};
}
