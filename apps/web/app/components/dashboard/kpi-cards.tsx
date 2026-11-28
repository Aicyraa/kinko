import { Download, FileText, Folder, Upload } from 'lucide-react';
import { motion } from 'motion/react';

interface KpiCardsProps {
	totalFiles: number;
	totalFolders: number;
	totalUploads: number;
	totalDownloads: number;
}

const fmt = new Intl.NumberFormat('en-US');

export function KpiCards({
	totalFiles,
	totalFolders,
	totalUploads,
	totalDownloads,
}: KpiCardsProps) {
	const items = [
		{
			id: 'files',
			label: 'Files',
			value: fmt.format(totalFiles),
			icon: FileText,
		},
		{
			id: 'folders',
			label: 'Folders',
			value: fmt.format(totalFolders),
			icon: Folder,
		},
		{
			id: 'uploads',
			label: 'Total Uploads',
			value: fmt.format(totalUploads),
			icon: Upload,
		},
		{
			id: 'downloads',
			label: 'Total Downloads',
			value: fmt.format(totalDownloads),
			icon: Download,
		},
	];

	return (
		<section
			aria-label="Workspace metrics"
			className="grid gap-4 grid-cols-2 lg:grid-cols-4"
		>
			{items.map((item, idx) => {
				const Icon = item.icon;
				return (
					<motion.article
						key={item.id}
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{
							duration: 0.25,
							delay: idx * 0.04,
							ease: [0.22, 1, 0.36, 1],
						}}
						className="rounded-xl border border-border bg-card p-5 space-y-3"
					>
						<div className="flex items-center justify-between gap-2">
							<span className="text-xs font-medium text-muted-foreground">
								{item.label}
							</span>
							<div className="size-8 rounded-lg bg-secondary border border-border flex items-center justify-center">
								<Icon className="size-3.5" aria-hidden="true" />
							</div>
						</div>
						<div className="text-2xl font-semibold tracking-tight font-mono tabular-nums">
							{item.value}
						</div>
					</motion.article>
				);
			})}
		</section>
	);
}
