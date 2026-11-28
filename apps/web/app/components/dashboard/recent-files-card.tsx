import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router';
import { type FileItem, formatBytes, formatDate } from '../../lib/api';
import { FileTypeIcon } from '../files/file-icon';

interface RecentFilesCardProps {
	files: FileItem[];
	onPreview: (file: FileItem) => void;
}

export function RecentFilesCard({ files, onPreview }: RecentFilesCardProps) {
	return (
		<section className="rounded-xl border border-border bg-card p-6 space-y-4">
			<div className="flex items-center justify-between gap-2">
				<div>
					<h2 className="text-sm font-semibold tracking-tight">Recent Files</h2>
					<p className="text-xs text-muted-foreground mt-0.5">
						Latest uploads in this workspace
					</p>
				</div>
				<Link
					to="/files"
					className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
				>
					<span>View All</span>
					<ArrowUpRight className="size-3.5" aria-hidden="true" />
				</Link>
			</div>

			{files.length === 0 ? (
				<p className="text-sm text-muted-foreground py-6 text-center">
					No files uploaded yet.
				</p>
			) : (
				<ul className="divide-y divide-border">
					{files.map((file) => (
						<li key={file.id} className="py-2.5 first:pt-0 last:pb-0">
							<button
								type="button"
								onClick={() => onPreview(file)}
								className="w-full flex items-center justify-between gap-3 text-left rounded-lg p-1.5 -mx-1.5 hover:bg-secondary/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<div className="flex items-center gap-3 min-w-0">
									<div className="size-8 rounded-md bg-secondary border border-border flex items-center justify-center shrink-0">
										<FileTypeIcon
											mimeType={file.mimeType}
											fileName={file.name}
											className="size-4"
										/>
									</div>
									<div className="min-w-0">
										<p className="text-sm font-medium truncate">{file.name}</p>
										<p className="text-[11px] font-mono text-muted-foreground tabular-nums">
											{formatBytes(file.sizeBytes)} · {formatDate(file.createdAt)}
										</p>
									</div>
								</div>
							</button>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
