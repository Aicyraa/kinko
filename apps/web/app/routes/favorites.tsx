import { Download, Eye, Folder, Star } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { FileTypeIcon, getFileKindLabel } from '../components/files/file-icon';
import { FilePreviewModal } from '../components/files/file-preview-modal';
import { getActiveTenant } from '../components/layout/app-shell';
import { Button } from '../components/ui/button';
import { useFavorites, useToggleFavorite } from '../hooks/use-advanced';
import { useSession } from '../hooks/use-auth';
import { useDownloadFile } from '../hooks/use-files';
import { ApiError, type FileItem, formatBytes, formatDate } from '../lib/api';
import type { Route } from './+types/favorites';

export function meta(_: Route.MetaArgs) {
	return [{ title: 'Favorites — Kinko' }];
}

export default function FavoritesPage() {
	const { data: session } = useSession();
	const activeTenant = session ? getActiveTenant(session) : undefined;
	const tenantId = activeTenant?.id ?? null;

	const favoritesQuery = useFavorites(tenantId);
	const toggleFavorite = useToggleFavorite(tenantId);
	const downloadFile = useDownloadFile(tenantId);
	const [previewFile, setPreviewFile] = useState<FileItem | null>(null);

	const items = favoritesQuery.data?.items ?? [];
	const favoriteFiles = items
		.map((item) => item.file)
		.filter((f): f is FileItem => Boolean(f));

	async function handleUnstar(
		targetType: 'FILE' | 'FOLDER',
		targetId: string,
		name: string,
	) {
		try {
			await toggleFavorite.mutateAsync({
				targetType,
				targetId,
				isFavorite: true,
			});
			toast.success(`Removed "${name}" from favorites`);
		} catch (err) {
			toast.error(
				err instanceof ApiError ? err.message : 'Failed to update favorites.',
			);
		}
	}

	async function handleDownload(fileId: string) {
		try {
			await downloadFile.mutateAsync(fileId);
		} catch (err) {
			toast.error(
				err instanceof ApiError ? err.message : 'Failed to download file.',
			);
		}
	}

	return (
		<div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-6">
			<motion.div
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.24 }}
				className="flex items-center justify-between gap-4"
			>
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">Favorites</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Starred files and folders pinned for quick access in{' '}
						<span className="font-medium text-foreground">
							{activeTenant?.name ?? 'your vault'}
						</span>
						.
					</p>
				</div>
				<Button asChild variant="outline" size="sm">
					<Link to="/files">Browse Vault</Link>
				</Button>
			</motion.div>

			{favoritesQuery.isLoading ? (
				<div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
					{['s1', 's2', 's3'].map((key) => (
						<div
							key={key}
							className="h-24 rounded-xl border border-border bg-card animate-pulse"
						/>
					))}
				</div>
			) : items.length === 0 ? (
				<div className="rounded-2xl border border-border bg-card p-10 text-center space-y-4">
					<div className="size-12 rounded-xl bg-secondary border border-border flex items-center justify-center mx-auto">
						<Star className="size-5 text-muted-foreground" aria-hidden="true" />
					</div>
					<h2 className="text-lg font-semibold tracking-tight">
						No Favorites Yet
					</h2>
					<p className="text-sm text-muted-foreground max-w-md mx-auto">
						Click the star icon on any file or folder to pin it here for instant
						access.
					</p>
					<Button asChild variant="outline">
						<Link to="/files">Go to Files</Link>
					</Button>
				</div>
			) : (
				<div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
					{items.map((item, idx) => {
						if (item.targetType === 'FOLDER' && item.folder) {
							const folder = item.folder;
							return (
								<motion.article
									key={item.id}
									initial={{ opacity: 0, y: 8 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{
										duration: 0.22,
										delay: Math.min(idx * 0.03, 0.2),
									}}
									className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-3 hover:border-foreground/30 transition-colors"
								>
									<Link
										to={`/files/${folder.id}`}
										className="flex items-center gap-3 min-w-0 flex-1"
									>
										<div className="size-9 rounded-lg bg-secondary border border-border flex items-center justify-center shrink-0">
											<Folder className="size-4" aria-hidden="true" />
										</div>
										<div className="min-w-0">
											<div className="text-sm font-medium truncate">
												{folder.name}
											</div>
											<div className="text-[11px] font-mono text-muted-foreground">
												Folder · {formatDate(folder.updatedAt)}
											</div>
										</div>
									</Link>
									<motion.button
										type="button"
										whileTap={{ scale: 0.85 }}
										aria-label={`Remove ${folder.name} from favorites`}
										onClick={() =>
											void handleUnstar('FOLDER', folder.id, folder.name)
										}
										className="p-1.5 rounded-md text-foreground hover:bg-secondary transition-colors"
									>
										<Star className="size-4 fill-current" aria-hidden="true" />
									</motion.button>
								</motion.article>
							);
						}

						if (item.targetType === 'FILE' && item.file) {
							const file = item.file;
							return (
								<motion.article
									key={item.id}
									initial={{ opacity: 0, y: 8 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{
										duration: 0.22,
										delay: Math.min(idx * 0.03, 0.2),
									}}
									className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between gap-4 hover:border-foreground/30 transition-colors"
								>
									<div className="flex items-start justify-between gap-2">
										<div className="size-9 rounded-lg bg-secondary border border-border flex items-center justify-center shrink-0">
											<FileTypeIcon
												mimeType={file.mimeType}
												fileName={file.name}
												className="size-4"
											/>
										</div>
										<div className="flex items-center gap-1">
											<Button
												type="button"
												variant="ghost"
												size="icon-xs"
												aria-label={`Preview ${file.name}`}
												onClick={() => setPreviewFile(file)}
											>
												<Eye className="size-3.5" aria-hidden="true" />
											</Button>
											<Button
												type="button"
												variant="ghost"
												size="icon-xs"
												aria-label={`Download ${file.name}`}
												onClick={() => void handleDownload(file.id)}
											>
												<Download className="size-3.5" aria-hidden="true" />
											</Button>
											<motion.button
												type="button"
												whileTap={{ scale: 0.85 }}
												aria-label={`Remove ${file.name} from favorites`}
												onClick={() =>
													void handleUnstar('FILE', file.id, file.name)
												}
												className="p-1 rounded-md text-foreground hover:bg-secondary transition-colors"
											>
												<Star
													className="size-3.5 fill-current"
													aria-hidden="true"
												/>
											</motion.button>
										</div>
									</div>

									<div className="min-w-0 space-y-1">
										<button
											type="button"
											onClick={() => setPreviewFile(file)}
											className="w-full text-left text-sm font-medium truncate hover:underline"
										>
											{file.name}
										</button>
										<div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground tabular-nums">
											<span>{getFileKindLabel(file.mimeType, file.name)}</span>
											<span>{formatBytes(file.sizeBytes)}</span>
										</div>
									</div>
								</motion.article>
							);
						}

						return null;
					})}
				</div>
			)}

			<FilePreviewModal
				file={previewFile}
				files={favoriteFiles}
				tenantId={tenantId}
				onClose={() => setPreviewFile(null)}
				onSelectFile={setPreviewFile}
			/>
		</div>
	);
}
