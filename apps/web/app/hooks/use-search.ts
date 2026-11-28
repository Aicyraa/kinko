import { useQuery } from '@tanstack/react-query';
import {
	api,
	type FilesListPayload,
	parseApiResponse,
	tenantHeaders,
} from '../lib/api';

export type SearchFileType =
	| 'all'
	| 'image'
	| 'pdf'
	| 'text'
	| 'audio'
	| 'video'
	| 'archive'
	| 'other';

export interface SearchFilters {
	q: string;
	type: SearchFileType;
	dateFrom: string;
	dateTo: string;
	minSize?: number;
	maxSize?: number;
	page: number;
	limit: number;
}

export function useSearchFiles(
	tenantId: string | null | undefined,
	filters: SearchFilters,
) {
	return useQuery({
		queryKey: ['vault', 'search', tenantId ?? 'none', filters] as const,
		enabled: Boolean(tenantId),
		queryFn: async (): Promise<FilesListPayload> => {
			const res = await api.api.v1.search.$get(
				{
					query: {
						...(filters.q ? { q: filters.q } : {}),
						type: filters.type,
						...(filters.dateFrom ? { dateFrom: filters.dateFrom } : {}),
						...(filters.dateTo ? { dateTo: filters.dateTo } : {}),
						...(filters.minSize !== undefined
							? { minSize: String(filters.minSize) }
							: {}),
						...(filters.maxSize !== undefined
							? { maxSize: String(filters.maxSize) }
							: {}),
						page: String(filters.page),
						limit: String(filters.limit),
						sortBy: 'updatedAt',
						sortOrder: 'desc',
					},
				},
				{ headers: tenantHeaders(tenantId) },
			);
			return parseApiResponse<FilesListPayload>(res);
		},
	});
}
