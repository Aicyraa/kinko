import { useQuery } from '@tanstack/react-query';
import {
	api,
	type FileItem,
	parseApiResponse,
	tenantHeaders,
} from '../lib/api';

export interface AnalyticsOverviewData {
	storageUsedBytes: number;
	storageQuotaBytes: number;
	usagePercent: number;
	totalFiles: number;
	totalFolders: number;
	totalUploads: number;
	totalDownloads: number;
	recentFiles: FileItem[];
}

export interface StoragePoint {
	date: string;
	storageUsedBytes: number;
	fileCount: number;
	folderCount: number;
	uploadCount: number;
	downloadCount: number;
}

export interface FileTypeSlice {
	category: string;
	count: number;
	totalBytes: number;
	sharePercent: number;
}

export interface ActivityEntry {
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

export function useAnalyticsOverview(tenantId: string | null | undefined) {
	return useQuery({
		queryKey: ['vault', 'analytics', 'overview', tenantId ?? 'none'] as const,
		enabled: Boolean(tenantId),
		queryFn: async (): Promise<AnalyticsOverviewData> => {
			const res = await api.api.v1.analytics.overview.$get(undefined, {
				headers: tenantHeaders(tenantId),
			});
			return parseApiResponse<AnalyticsOverviewData>(res);
		},
	});
}

export function useStorageHistory(
	tenantId: string | null | undefined,
	days: number,
) {
	return useQuery({
		queryKey: ['vault', 'analytics', 'storage', tenantId ?? 'none', days] as const,
		enabled: Boolean(tenantId),
		queryFn: async (): Promise<{ days: number; points: StoragePoint[] }> => {
			const res = await api.api.v1.analytics.storage.$get(
				{ query: { days: String(days) } },
				{ headers: tenantHeaders(tenantId) },
			);
			return parseApiResponse<{ days: number; points: StoragePoint[] }>(res);
		},
	});
}

export function useFileTypeDistribution(tenantId: string | null | undefined) {
	return useQuery({
		queryKey: ['vault', 'analytics', 'file-types', tenantId ?? 'none'] as const,
		enabled: Boolean(tenantId),
		queryFn: async (): Promise<{
			totalFiles: number;
			totalBytes: number;
			distribution: FileTypeSlice[];
		}> => {
			const res = await api.api.v1.analytics['file-types'].$get(undefined, {
				headers: tenantHeaders(tenantId),
			});
			return parseApiResponse<{
				totalFiles: number;
				totalBytes: number;
				distribution: FileTypeSlice[];
			}>(res);
		},
	});
}

export function useActivities(
	tenantId: string | null | undefined,
	limit = 10,
) {
	return useQuery({
		queryKey: ['vault', 'activities', tenantId ?? 'none', limit] as const,
		enabled: Boolean(tenantId),
		queryFn: async (): Promise<{ items: ActivityEntry[] }> => {
			const res = await api.api.v1.activities.$get(
				{ query: { page: '1', limit: String(limit) } },
				{ headers: tenantHeaders(tenantId) },
			);
			return parseApiResponse<{ items: ActivityEntry[] }>(res);
		},
	});
}
