import {
	AlertCircle,
	CheckCircle2,
	ChevronDown,
	ChevronUp,
	Loader2,
	RotateCcw,
	X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useUploadQueue } from '../../hooks/use-upload-queue';
import { formatBytes } from '../../lib/api';
import { Button } from '../ui/button';

export function UploadQueueDrawer() {
	const { tasks, retryTask, cancelTask, dismissTask, clearCompleted } =
		useUploadQueue();
	const [collapsed, setCollapsed] = useState(false);

	if (tasks.length === 0) return null;

	const activeCount = tasks.filter(
		(t) => t.status === 'queued' || t.status === 'uploading' || t.status === 'verifying',
	).length;
	const failedCount = tasks.filter((t) => t.status === 'error').length;
	const completedCount = tasks.filter((t) => t.status === 'completed').length;

	return (
		<AnimatePresence>
			<motion.aside
				aria-label="Upload queue"
				initial={{ opacity: 0, y: 20, scale: 0.98 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				exit={{ opacity: 0, y: 20, scale: 0.98 }}
				transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
				className="fixed bottom-4 right-4 z-40 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-border bg-card shadow-lg overflow-hidden"
			>
				<div className="flex items-center justify-between gap-2 px-4 py-3 bg-secondary border-b border-border">
					<div className="min-w-0">
						<p className="text-xs font-semibold tracking-tight truncate">
							{activeCount > 0
								? `Uploading ${activeCount} ${activeCount === 1 ? 'file' : 'files'}…`
								: failedCount > 0
									? `${failedCount} upload ${failedCount === 1 ? 'failure' : 'failures'}`
									: `${completedCount} ${completedCount === 1 ? 'file' : 'files'} uploaded`}
						</p>
					</div>

					<div className="flex items-center gap-1">
						{completedCount > 0 && (
							<Button
								variant="ghost"
								size="xs"
								onClick={clearCompleted}
								className="text-xs text-muted-foreground"
							>
								Clear
							</Button>
						)}
						<button
							type="button"
							aria-label={collapsed ? 'Expand upload queue' : 'Collapse upload queue'}
							onClick={() => setCollapsed((prev) => !prev)}
							className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{collapsed ? (
								<ChevronUp className="size-4" aria-hidden="true" />
							) : (
								<ChevronDown className="size-4" aria-hidden="true" />
							)}
						</button>
					</div>
				</div>

				{!collapsed && (
					<div className="max-h-72 overflow-y-auto divide-y divide-border overscroll-contain">
						{tasks.map((task) => (
							<div key={task.id} className="px-4 py-3 space-y-2">
								<div className="flex items-start justify-between gap-2">
									<div className="min-w-0 flex-1">
										<p className="text-xs font-medium truncate">
											{task.fileName}
										</p>
										<p className="text-[11px] font-mono text-muted-foreground tabular-nums mt-0.5">
											{formatBytes(task.sizeBytes)} ·{' '}
											{task.status === 'uploading'
												? `Uploading ${task.progress}%…`
												: task.status === 'verifying'
													? 'Verifying…'
													: task.status === 'completed'
														? 'Uploaded'
														: task.status === 'cancelled'
															? 'Cancelled'
															: task.status === 'error'
																? 'Failed'
																: 'Queued…'}
										</p>
									</div>

									<div className="flex items-center gap-1 shrink-0">
										{task.status === 'uploading' || task.status === 'verifying' ? (
											<>
												<Loader2
													className="size-3.5 animate-spin text-muted-foreground"
													aria-hidden="true"
												/>
												{task.status === 'uploading' && (
													<button
														type="button"
														aria-label={`Cancel ${task.fileName}`}
														onClick={() => cancelTask(task.id)}
														className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
													>
														<X className="size-3.5" aria-hidden="true" />
													</button>
												)}
											</>
										) : task.status === 'completed' ? (
											<>
												<CheckCircle2
													className="size-4 text-foreground"
													aria-hidden="true"
												/>
												<button
													type="button"
													aria-label={`Dismiss ${task.fileName}`}
													onClick={() => dismissTask(task.id)}
													className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
												>
													<X className="size-3.5" aria-hidden="true" />
												</button>
											</>
										) : task.status === 'error' ? (
											<>
												<button
													type="button"
													aria-label={`Retry ${task.fileName}`}
													onClick={() => retryTask(task.id)}
													className="p-1 rounded text-foreground hover:bg-secondary transition-colors"
												>
													<RotateCcw className="size-3.5" aria-hidden="true" />
												</button>
												<button
													type="button"
													aria-label={`Dismiss ${task.fileName}`}
													onClick={() => dismissTask(task.id)}
													className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
												>
													<X className="size-3.5" aria-hidden="true" />
												</button>
											</>
										) : (
											<button
												type="button"
												aria-label={`Dismiss ${task.fileName}`}
												onClick={() => dismissTask(task.id)}
												className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
											>
												<X className="size-3.5" aria-hidden="true" />
											</button>
										)}
									</div>
								</div>

								{(task.status === 'uploading' || task.status === 'verifying') && (
									<div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
										<motion.div
											className="h-full bg-primary rounded-full"
											initial={{ width: 0 }}
											animate={{ width: `${task.progress}%` }}
											transition={{ duration: 0.15 }}
										/>
									</div>
								)}

								{task.status === 'error' && task.errorMessage && (
									<div
										role="alert"
										className="flex items-start gap-1.5 text-[11px] text-destructive"
									>
										<AlertCircle
											className="size-3.5 shrink-0 mt-0.5"
											aria-hidden="true"
										/>
										<span>{task.errorMessage}</span>
									</div>
								)}
							</div>
						))}
					</div>
				)}
			</motion.aside>
		</AnimatePresence>
	);
}
