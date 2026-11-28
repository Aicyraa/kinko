import { motion } from 'motion/react';
import { useState } from 'react';
import { FileTypeChart } from '../components/dashboard/file-type-chart';
import { KpiCards } from '../components/dashboard/kpi-cards';
import { RecentActivityCard } from '../components/dashboard/recent-activity-card';
import { RecentFilesCard } from '../components/dashboard/recent-files-card';
import { StorageUsageCard } from '../components/dashboard/storage-usage-card';
import { StorageUsageChart } from '../components/dashboard/storage-usage-chart';
import { FilePreviewModal } from '../components/files/file-preview-modal';
import { getActiveTenant } from '../components/layout/app-shell';
import { Button } from '../components/ui/button';
import {
	useActivities,
	useAnalyticsOverview,
	useFileTypeDistribution,
	useStorageHistory,
} from '../hooks/use-analytics';
import { useSession } from '../hooks/use-auth';
import type { FileItem } from '../lib/api';
import type { Route } from './+types/dashboard';

export function meta(_: Route.MetaArgs) {
	return [{ title: 'Overview — Kinko' }];
}

export default function DashboardPage() {
	const { data: session } = useSession();
	const activeTenant = session ? getActiveTenant(session) : undefined;
	const tenantId = activeTenant?.id ?? null;

	const [days, setDays] = useState(14);
	const [previewFile, setPreviewFile] = useState<FileItem | null>(null);

	const overview = useAnalyticsOverview(tenantId);
	const storageHistory = useStorageHistory(tenantId, days);
	const fileTypes = useFileTypeDistribution(tenantId);
	const activities = useActivities(tenantId, 8);

	const isLoading =
		overview.isLoading ||
		storageHistory.isLoading ||
		fileTypes.isLoading ||
		activities.isLoading;

	const isError =
		overview.isError ||
		storageHistory.isError ||
		fileTypes.isError ||
		activities.isError;

	return (
		<div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-6">
			<motion.div
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.22 }}
			>
				<h1 className="text-2xl font-semibold tracking-tight">
					{activeTenant?.name ?? 'Workspace'} Overview
				</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Real-time storage utilization, file breakdown, and workspace activity.
				</p>
			</motion.div>

			{isLoading ? (
				<div
					role="status"
					aria-busy="true"
					className="space-y-4 animate-pulse"
				>
					<span className="sr-only">Loading dashboard analytics…</span>
					<div className="h-32 rounded-xl border border-border bg-card" />
					<div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
						<div className="h-24 rounded-xl border border-border bg-card" />
						<div className="h-24 rounded-xl border border-border bg-card" />
						<div className="h-24 rounded-xl border border-border bg-card" />
						<div className="h-24 rounded-xl border border-border bg-card" />
					</div>
				</div>
			) : isError || !overview.data ? (
				<div
					role="alert"
					className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center space-y-3"
				>
					<p className="text-sm text-muted-foreground">
						Could not load workspace analytics.
					</p>
					<Button
						type="button"
						variant="outline"
						onClick={() => {
							void overview.refetch();
							void storageHistory.refetch();
							void fileTypes.refetch();
							void activities.refetch();
						}}
					>
						Try Again
					</Button>
				</div>
			) : (
				<>
					<StorageUsageCard
						usedBytes={overview.data.storageUsedBytes}
						quotaBytes={overview.data.storageQuotaBytes}
						usagePercent={overview.data.usagePercent}
					/>

					<KpiCards
						totalFiles={overview.data.totalFiles}
						totalFolders={overview.data.totalFolders}
						totalUploads={overview.data.totalUploads}
						totalDownloads={overview.data.totalDownloads}
					/>

					<div className="grid gap-6 lg:grid-cols-2">
						<StorageUsageChart
							points={storageHistory.data?.points ?? []}
							days={days}
							onDaysChange={setDays}
						/>
						<FileTypeChart
							distribution={fileTypes.data?.distribution ?? []}
							totalFiles={fileTypes.data?.totalFiles ?? 0}
						/>
					</div>

					<div className="grid gap-6 lg:grid-cols-2">
						<RecentFilesCard
							files={overview.data.recentFiles}
							onPreview={setPreviewFile}
						/>
						<RecentActivityCard items={activities.data?.items ?? []} />
					</div>
				</>
			)}

			<FilePreviewModal
				file={previewFile}
				files={overview.data?.recentFiles ?? []}
				tenantId={tenantId}
				onClose={() => setPreviewFile(null)}
				onSelectFile={setPreviewFile}
			/>
		</div>
	);
}
