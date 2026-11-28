import { useEffect, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { FileTypeSlice } from '../../hooks/use-analytics';
import { formatBytes } from '../../lib/api';

const CHART_SHADES = [
	'var(--chart-1)',
	'var(--chart-2)',
	'var(--chart-3)',
	'var(--chart-4)',
	'var(--chart-5)',
];

interface FileTypeChartProps {
	distribution: FileTypeSlice[];
	totalFiles: number;
}

export function FileTypeChart({
	distribution,
	totalFiles,
}: FileTypeChartProps) {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	return (
		<section className="rounded-xl border border-border bg-card p-6 space-y-4">
			<div>
				<h2 className="text-sm font-semibold tracking-tight">
					File Type Distribution
				</h2>
				<p className="text-xs text-muted-foreground mt-0.5">
					Breakdown across {totalFiles} active{' '}
					{totalFiles === 1 ? 'file' : 'files'}
				</p>
			</div>

			{distribution.length === 0 ? (
				<div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
					No active files in this workspace yet.
				</div>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 items-center">
					<div className="h-56 w-full min-w-0">
						{mounted ? (
							<ResponsiveContainer width="100%" height={224} minWidth={0}>
								<PieChart>
									<Pie
										data={distribution}
										dataKey="count"
										nameKey="category"
										innerRadius={52}
										outerRadius={84}
										paddingAngle={2}
										stroke="var(--card)"
										strokeWidth={2}
									>
										{distribution.map((entry, idx) => (
											<Cell
												key={entry.category}
												fill={CHART_SHADES[idx % CHART_SHADES.length]}
											/>
										))}
									</Pie>
									<Tooltip
										contentStyle={{
											backgroundColor: 'var(--card)',
											borderColor: 'var(--border)',
											borderRadius: '0.5rem',
											fontSize: '12px',
										}}
										formatter={(value, name) => [
											`${value} files`,
											String(name),
										]}
									/>
								</PieChart>
							</ResponsiveContainer>
						) : (
							<div className="h-full w-full rounded-lg bg-secondary/40 animate-pulse" />
						)}
					</div>

					<ul className="space-y-2.5">
						{distribution.map((slice, idx) => (
							<li
								key={slice.category}
								className="flex items-center justify-between gap-3 text-xs"
							>
								<div className="flex items-center gap-2 min-w-0">
									<span
										aria-hidden="true"
										className="size-2.5 rounded-full shrink-0 border border-border"
										style={{
											backgroundColor:
												CHART_SHADES[idx % CHART_SHADES.length],
										}}
									/>
									<span className="font-medium truncate">{slice.category}</span>
								</div>
								<span className="font-mono text-muted-foreground tabular-nums shrink-0">
									{slice.count} · {formatBytes(slice.totalBytes)}
								</span>
							</li>
						))}
					</ul>
				</div>
			)}
		</section>
	);
}
