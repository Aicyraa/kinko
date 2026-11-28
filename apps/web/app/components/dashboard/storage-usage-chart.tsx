import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import {
	Area,
	AreaChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import type { StoragePoint } from '../../hooks/use-analytics';
import { formatBytes } from '../../lib/api';

interface StorageUsageChartProps {
	points: StoragePoint[];
	days: number;
	onDaysChange: (days: number) => void;
}

const DAY_OPTIONS = [7, 14, 30] as const;

export function StorageUsageChart({
	points,
	days,
	onDaysChange,
}: StorageUsageChartProps) {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	return (
		<section className="rounded-xl border border-border bg-card p-6 space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="text-sm font-semibold tracking-tight">
						Storage Usage Trend
					</h2>
					<p className="text-xs text-muted-foreground mt-0.5">
						Daily vault footprint over the last {days} days
					</p>
				</div>

				<fieldset
					aria-label="Storage history range"
					className="inline-flex items-center rounded-lg bg-secondary p-1 border border-border m-0"
				>
					{DAY_OPTIONS.map((opt) => (
						<button
							key={opt}
							type="button"
							aria-pressed={days === opt}
							onClick={() => onDaysChange(opt)}
							className="relative px-2.5 py-1 rounded-md text-xs font-mono transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{days === opt && (
								<motion.span
									layoutId="storage-range-pill"
									transition={{ type: 'spring', stiffness: 420, damping: 32 }}
									className="absolute inset-0 rounded-md bg-card shadow-xs border border-border"
								/>
							)}
							<span className="relative z-10">{opt}D</span>
						</button>
					))}
				</fieldset>
			</div>

			<div className="h-64 w-full min-w-0">
				{mounted ? (
					<ResponsiveContainer width="100%" height={256} minWidth={0}>
						<AreaChart
							data={points}
							margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
						>
							<defs>
								<linearGradient id="kinkoStorageFill" x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.22} />
									<stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
								</linearGradient>
							</defs>
							<CartesianGrid
								strokeDasharray="3 3"
								vertical={false}
								stroke="var(--border)"
							/>
							<XAxis
								dataKey="date"
								tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
								tickLine={false}
								axisLine={false}
								tickFormatter={(v: string) => v.slice(5)}
							/>
							<YAxis
								tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
								tickLine={false}
								axisLine={false}
								width={64}
								tickFormatter={(v: number) => formatBytes(v)}
							/>
							<Tooltip
								contentStyle={{
									backgroundColor: 'var(--card)',
									borderColor: 'var(--border)',
									borderRadius: '0.5rem',
									fontSize: '12px',
								}}
								formatter={(value) => [
									formatBytes(Number(value ?? 0)),
									'Storage Used',
								]}
							/>
							<Area
								type="monotone"
								dataKey="storageUsedBytes"
								stroke="var(--chart-1)"
								strokeWidth={2}
								fill="url(#kinkoStorageFill)"
							/>
						</AreaChart>
					</ResponsiveContainer>
				) : (
					<div className="h-full w-full rounded-lg bg-secondary/40 animate-pulse" />
				)}
			</div>
		</section>
	);
}
