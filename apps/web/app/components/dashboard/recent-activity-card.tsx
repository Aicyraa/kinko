import { Activity } from 'lucide-react';
import type { ActivityEntry } from '../../hooks/use-analytics';
import { formatDate } from '../../lib/api';

const ACTION_LABELS: Record<string, string> = {
	FILE_UPLOADED: 'Uploaded file',
	FILE_DOWNLOADED: 'Downloaded file',
	FILE_RENAMED: 'Renamed file',
	FILE_MOVED: 'Moved file',
	FILE_DELETED: 'Moved file to Trash',
	FILE_RESTORED: 'Restored file',
	FILE_PERMANENTLY_DELETED: 'Permanently deleted file',
	FOLDER_CREATED: 'Created folder',
	FOLDER_RENAMED: 'Renamed folder',
	FOLDER_MOVED: 'Moved folder',
	FOLDER_DELETED: 'Moved folder to Trash',
	FOLDER_RESTORED: 'Restored folder',
	FOLDER_PERMANENTLY_DELETED: 'Permanently deleted folder',
};

export function RecentActivityCard({ items }: { items: ActivityEntry[] }) {
	return (
		<section className="rounded-xl border border-border bg-card p-6 space-y-4">
			<div>
				<h2 className="text-sm font-semibold tracking-tight">
					Recent Activity
				</h2>
				<p className="text-xs text-muted-foreground mt-0.5">
					Latest workspace events
				</p>
			</div>

			{items.length === 0 ? (
				<p className="text-sm text-muted-foreground py-6 text-center">
					No recent activity recorded.
				</p>
			) : (
				<ul className="divide-y divide-border">
					{items.map((event) => (
						<li
							key={event.id}
							className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3"
						>
							<div className="flex items-start gap-2.5 min-w-0">
								<div className="size-7 rounded-md bg-secondary border border-border flex items-center justify-center shrink-0 mt-0.5">
									<Activity className="size-3.5" aria-hidden="true" />
								</div>
								<div className="min-w-0">
									<p className="text-xs font-medium text-foreground">
										{ACTION_LABELS[event.action] ?? event.action}
									</p>
									{event.targetName && (
										<p className="text-xs text-muted-foreground truncate font-mono">
											{event.targetName}
										</p>
									)}
								</div>
							</div>
							<span className="text-[11px] font-mono text-muted-foreground shrink-0">
								{formatDate(event.createdAt)}
							</span>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
