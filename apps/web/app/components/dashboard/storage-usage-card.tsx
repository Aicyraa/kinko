import { HardDrive } from 'lucide-react';
import { motion } from 'motion/react';
import { formatBytes } from '../../lib/api';
import { Badge } from '../ui/badge';

interface StorageUsageCardProps {
	usedBytes: number;
	quotaBytes: number;
	usagePercent: number;
}

export function StorageUsageCard({
	usedBytes,
	quotaBytes,
	usagePercent,
}: StorageUsageCardProps) {
	const remainingBytes = Math.max(0, quotaBytes - usedBytes);

	return (
		<motion.section
			aria-label="Storage usage summary"
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.25 }}
			className="rounded-xl border border-border bg-card p-6 space-y-4"
		>
			<div className="flex items-start justify-between gap-4">
				<div className="flex items-center gap-3">
					<div className="size-10 rounded-lg bg-secondary border border-border flex items-center justify-center">
						<HardDrive className="size-4" aria-hidden="true" />
					</div>
					<div>
						<h2 className="text-sm font-semibold tracking-tight">
							Vault Storage Capacity
						</h2>
						<p className="text-xs text-muted-foreground font-mono tabular-nums mt-0.5">
							{formatBytes(usedBytes)} used of {formatBytes(quotaBytes)}
						</p>
					</div>
				</div>
				<Badge variant="secondary" className="font-mono tabular-nums text-xs">
					{usagePercent}%
				</Badge>
			</div>

			<div
				role="progressbar"
				aria-valuenow={usagePercent}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-label="Vault storage usage"
				className="h-2.5 w-full rounded-full bg-secondary overflow-hidden border border-border/60"
			>
				<motion.div
					className="h-full rounded-full bg-primary"
					initial={{ width: 0 }}
					animate={{
						width: `${Math.max(usagePercent, usedBytes > 0 ? 1.5 : 0)}%`,
					}}
					transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
				/>
			</div>

			<div className="flex items-center justify-between text-xs text-muted-foreground font-mono tabular-nums">
				<span>Active + Trash objects</span>
				<span>{formatBytes(remainingBytes)} available</span>
			</div>
		</motion.section>
	);
}
