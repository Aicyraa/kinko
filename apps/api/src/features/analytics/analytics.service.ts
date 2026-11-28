import type { Tenant } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.ts';
import { type FileDTO, serializeFile } from '../../utils/serialize.ts';

export interface AnalyticsOverviewDTO {
	storageUsedBytes: number;
	storageQuotaBytes: number;
	usagePercent: number;
	totalFiles: number;
	totalFolders: number;
	totalUploads: number;
	totalDownloads: number;
	recentFiles: FileDTO[];
}

export interface StoragePointDTO {
	date: string;
	storageUsedBytes: number;
	fileCount: number;
	folderCount: number;
	uploadCount: number;
	downloadCount: number;
}

export interface FileTypeSliceDTO {
	category: string;
	count: number;
	totalBytes: number;
	sharePercent: number;
}

function classifyMimeType(mimeType: string): string {
	const mime = mimeType.toLowerCase();
	if (mime.startsWith('image/')) return 'Images';
	if (mime === 'application/pdf') return 'PDF';
	if (mime.startsWith('audio/')) return 'Audio';
	if (mime.startsWith('video/')) return 'Video';
	if (
		mime.includes('zip') ||
		mime.includes('tar') ||
		mime.includes('gzip')
	) {
		return 'Archives';
	}
	if (
		mime.startsWith('text/') ||
		mime.includes('json') ||
		mime.includes('sql') ||
		mime.includes('xml') ||
		mime.includes('javascript') ||
		mime.includes('typescript')
	) {
		return 'Code / Text';
	}
	return 'Other';
}

export async function getAnalyticsOverview(
	tenant: Tenant,
): Promise<AnalyticsOverviewDTO> {
	const [existingAnalytics, recentFiles] = await Promise.all([
		prisma.tenantAnalytics.findUnique({
			where: { tenantId: tenant.id },
		}),
		prisma.file.findMany({
			where: { tenantId: tenant.id, deletedAt: null },
			orderBy: { createdAt: 'desc' },
			take: 6,
		}),
	]);

	const analytics =
		existingAnalytics ??
		(await prisma.tenantAnalytics.upsert({
			where: { tenantId: tenant.id },
			create: { tenantId: tenant.id },
			update: {},
		}));

	const storageUsedBytes = Number(analytics.storageUsedBytes);
	const storageQuotaBytes = Number(tenant.storageQuotaBytes);
	const usagePercent =
		storageQuotaBytes > 0
			? Math.min(
					100,
					Math.round((storageUsedBytes / storageQuotaBytes) * 1000) / 10,
				)
			: 0;

	return {
		storageUsedBytes,
		storageQuotaBytes,
		usagePercent,
		totalFiles: analytics.totalFiles,
		totalFolders: analytics.totalFolders,
		totalUploads: Number(analytics.totalUploads),
		totalDownloads: Number(analytics.totalDownloads),
		recentFiles: recentFiles.map(serializeFile),
	};
}

export async function getStorageHistory(
	tenant: Tenant,
	days: number,
): Promise<{ days: number; points: StoragePointDTO[] }> {
	const now = new Date();
	const startDate = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)),
	);
	const todayIso = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	)
		.toISOString()
		.slice(0, 10);

	const [snapshots, analytics] = await Promise.all([
		prisma.storageUsageSnapshot.findMany({
			where: {
				tenantId: tenant.id,
				snapshotDate: { gte: startDate },
			},
			orderBy: { snapshotDate: 'asc' },
		}),
		prisma.tenantAnalytics.findUnique({
			where: { tenantId: tenant.id },
		}),
	]);

	const points: StoragePointDTO[] = snapshots.map((s) => ({
		date: s.snapshotDate.toISOString().slice(0, 10),
		storageUsedBytes: Number(s.storageUsedBytes),
		fileCount: s.fileCount,
		folderCount: s.folderCount,
		uploadCount: s.uploadCount,
		downloadCount: s.downloadCount,
	}));

	const hasToday = points.some((p) => p.date === todayIso);
	if (!hasToday) {
		points.push({
			date: todayIso,
			storageUsedBytes: Number(analytics?.storageUsedBytes ?? 0n),
			fileCount: analytics?.totalFiles ?? 0,
			folderCount: analytics?.totalFolders ?? 0,
			uploadCount: Number(analytics?.totalUploads ?? 0n),
			downloadCount: Number(analytics?.totalDownloads ?? 0n),
		});
	}

	return { days, points };
}

export async function getFileTypeDistribution(tenantId: string): Promise<{
	totalFiles: number;
	totalBytes: number;
	distribution: FileTypeSliceDTO[];
}> {
	const grouped = await prisma.file.groupBy({
		by: ['mimeType'],
		where: { tenantId, deletedAt: null },
		_count: { _all: true },
		_sum: { sizeBytes: true },
	});

	const buckets = new Map<string, { count: number; totalBytes: number }>();
	let totalFiles = 0;
	let totalBytes = 0;

	for (const row of grouped) {
		const category = classifyMimeType(row.mimeType);
		const count = row._count._all;
		const bytes = Number(row._sum.sizeBytes ?? 0n);

		totalFiles += count;
		totalBytes += bytes;

		const current = buckets.get(category) ?? { count: 0, totalBytes: 0 };
		current.count += count;
		current.totalBytes += bytes;
		buckets.set(category, current);
	}

	const distribution: FileTypeSliceDTO[] = Array.from(buckets.entries())
		.map(([category, stats]) => ({
			category,
			count: stats.count,
			totalBytes: stats.totalBytes,
			sharePercent:
				totalFiles > 0
					? Math.round((stats.count / totalFiles) * 1000) / 10
					: 0,
		}))
		.sort((a, b) => b.count - a.count);

	return {
		totalFiles,
		totalBytes,
		distribution,
	};
}
