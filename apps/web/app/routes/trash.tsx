import {
	AlertTriangle,
	Folder,
	RotateCcw,
	Trash2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { FileTypeIcon } from '../components/files/file-icon';
import { getActiveTenant } from '../components/layout/app-shell';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '../components/ui/dialog';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '../components/ui/table';
import { useSession } from '../hooks/use-auth';
import {
	type TrashItem,
	usePermanentDeleteTrashItem,
	useRestoreTrashItem,
	useTrashList,
} from '../hooks/use-trash';
import { ApiError, formatBytes, formatDate } from '../lib/api';
import type { Route } from './+types/trash';

export function meta(_: Route.MetaArgs) {
	return [{ title: 'Trash — Kinko' }];
}

const TRASH_SKEL_KEYS = ['ts-1', 'ts-2', 'ts-3', 'ts-4'];

function daysUntil(iso: string): string {
	const diffMs = new Date(iso).getTime() - Date.now();
	const days = Math.max(0, Math.ceil(diffMs / 86_400_000));
	return days === 1 ? '1 day left' : `${days} days left`;
}

export default function TrashPage() {
	const { data: session } = useSession();
	const activeTenant = session ? getActiveTenant(session) : undefined;
	const tenantId = activeTenant?.id ?? null;

	const trashQuery = useTrashList(tenantId);
	const restoreItem = useRestoreTrashItem(tenantId);
	const permanentDelete = usePermanentDeleteTrashItem(tenantId);

	const [confirmTarget, setConfirmTarget] = useState<TrashItem | null>(null);

	async function handleRestore(item: TrashItem) {
		try {
			const res = await restoreItem.mutateAsync({
				itemId: item.id,
				kind: item.kind,
			});
			toast.success(
				res.restoredToRoot
					? `Restored "${item.name}" to Vault Root`
					: `Restored "${item.name}"`,
			);
		} catch (err) {
			toast.error(
				err instanceof ApiError ? err.message : 'Failed to restore item.',
			);
		}
	}

	async function handlePermanentDelete() {
		if (!confirmTarget) return;
		try {
			await permanentDelete.mutateAsync(confirmTarget.id);
			toast.success(`Permanently deleted "${confirmTarget.name}"`);
			setConfirmTarget(null);
		} catch (err) {
			toast.error(
				err instanceof ApiError
					? err.message
					: 'Failed to permanently delete item.',
			);
		}
	}

	const items = trashQuery.data?.items ?? [];
	const retentionDays = trashQuery.data?.retentionDays ?? 30;

	return (
		<div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-6">
			<motion.div
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.22 }}
				className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
			>
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">Trash</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Restore deleted items or permanently purge them from storage.
					</p>
				</div>
				<Badge variant="secondary" className="font-mono text-xs w-fit">
					Auto-purged after {retentionDays} days
				</Badge>
			</motion.div>

			{trashQuery.isLoading ? (
				<div
					role="status"
					aria-busy="true"
					className="rounded-xl border border-border bg-card divide-y divide-border"
				>
					<span className="sr-only">Loading trash…</span>
					{TRASH_SKEL_KEYS.map((key) => (
						<div
							key={key}
							className="flex items-center justify-between px-4 py-4 animate-pulse"
						>
							<div className="h-4 w-48 rounded bg-secondary" />
							<div className="h-4 w-24 rounded bg-secondary" />
						</div>
					))}
				</div>
			) : trashQuery.isError ? (
				<div
					role="alert"
					className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center space-y-3"
				>
					<AlertTriangle
						className="size-6 text-destructive mx-auto"
						aria-hidden="true"
					/>
					<p className="text-sm text-muted-foreground">
						{trashQuery.error instanceof Error
							? trashQuery.error.message
							: 'Could not load trash items.'}
					</p>
					<Button
						type="button"
						variant="outline"
						onClick={() => void trashQuery.refetch()}
					>
						Try Again
					</Button>
				</div>
			) : items.length === 0 ? (
				<div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center space-y-3">
					<div className="size-12 rounded-xl bg-secondary border border-border flex items-center justify-center mx-auto">
						<Trash2
							className="size-5 text-muted-foreground"
							aria-hidden="true"
						/>
					</div>
					<h2 className="text-base font-semibold tracking-tight">
						Trash is empty
					</h2>
					<p className="text-sm text-muted-foreground max-w-sm mx-auto">
						Items you move to Trash will appear here before permanent deletion.
					</p>
				</div>
			) : (
				<div className="rounded-xl border border-border bg-card overflow-hidden">
					<Table>
						<TableHeader>
							<TableRow className="bg-secondary/60 hover:bg-secondary/60">
								<TableHead>Name</TableHead>
								<TableHead className="hidden sm:table-cell">Size</TableHead>
								<TableHead className="hidden md:table-cell">Deleted</TableHead>
								<TableHead className="hidden lg:table-cell">
									Retention
								</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{items.map((item) => (
								<TableRow key={`${item.kind}-${item.id}`}>
									<TableCell className="max-w-xs">
										<div className="flex items-center gap-3 min-w-0">
											<div className="size-8 rounded-md bg-secondary border border-border flex items-center justify-center shrink-0">
												{item.kind === 'folder' ? (
													<Folder className="size-4" aria-hidden="true" />
												) : (
													<FileTypeIcon
														mimeType={item.mimeType ?? 'application/octet-stream'}
														fileName={item.name}
														className="size-4"
													/>
												)}
											</div>
											<span className="font-medium truncate">{item.name}</span>
										</div>
									</TableCell>
									<TableCell className="hidden sm:table-cell text-xs font-mono text-muted-foreground tabular-nums">
										{item.sizeBytes !== null ? formatBytes(item.sizeBytes) : '—'}
									</TableCell>
									<TableCell className="hidden md:table-cell text-xs font-mono text-muted-foreground">
										{formatDate(item.deletedAt)}
									</TableCell>
									<TableCell className="hidden lg:table-cell text-xs font-mono text-muted-foreground">
										{daysUntil(item.expiresAt)}
									</TableCell>
									<TableCell className="text-right">
										<div className="inline-flex items-center gap-2">
											<Button
												type="button"
												variant="outline"
												size="xs"
												disabled={restoreItem.isPending}
												onClick={() => void handleRestore(item)}
											>
												<RotateCcw className="size-3.5" aria-hidden="true" />
												<span>Restore</span>
											</Button>
											<Button
												type="button"
												variant="destructive"
												size="xs"
												disabled={permanentDelete.isPending}
												onClick={() => setConfirmTarget(item)}
											>
												<Trash2 className="size-3.5" aria-hidden="true" />
												<span>Delete Forever</span>
											</Button>
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}

			<Dialog
				open={Boolean(confirmTarget)}
				onOpenChange={(o) => !o && setConfirmTarget(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete Forever</DialogTitle>
						<DialogDescription>
							This will permanently remove{' '}
							<span className="font-medium text-foreground">
								&ldquo;{confirmTarget?.name}&rdquo;
							</span>{' '}
							and its stored object from Neon Object Storage. This action cannot
							be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setConfirmTarget(null)}
						>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={permanentDelete.isPending}
							onClick={() => void handlePermanentDelete()}
						>
							{permanentDelete.isPending ? 'Deleting…' : 'Delete Forever'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
