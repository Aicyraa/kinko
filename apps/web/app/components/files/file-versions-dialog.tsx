import { Download, History, RotateCcw, Upload } from 'lucide-react';
import { type ChangeEvent, useRef } from 'react';
import { toast } from 'sonner';
import {
	useDownloadFileVersion,
	useFileVersions,
	useRestoreFileVersion,
} from '../../hooks/use-advanced';
import { useUploadQueue } from '../../hooks/use-upload-queue';
import {
	ApiError,
	type FileItem,
	formatBytes,
	formatDate,
} from '../../lib/api';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '../ui/dialog';

interface FileVersionsDialogProps {
	file: FileItem | null;
	tenantId: string | null;
	onClose: () => void;
}

export function FileVersionsDialog({
	file,
	tenantId,
	onClose,
}: FileVersionsDialogProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const { enqueueVersionUpload } = useUploadQueue();

	const versionsQuery = useFileVersions(tenantId, file?.id ?? null);
	const downloadVersion = useDownloadFileVersion(tenantId);
	const restoreVersion = useRestoreFileVersion(tenantId, file?.id ?? null);

	function handleUploadNewVersion(e: ChangeEvent<HTMLInputElement>) {
		const nextFile = e.target.files?.[0];
		if (nextFile && tenantId && file) {
			enqueueVersionUpload(nextFile, { tenantId, fileId: file.id });
			toast.success(`Uploading new version of "${file.name}"`);
		}
		e.target.value = '';
	}

	async function handleDownload(versionId: string, versionNumber: number) {
		if (!file) return;
		try {
			await downloadVersion.mutateAsync({
				fileId: file.id,
				versionId,
				fileName: file.name,
				versionNumber,
			});
		} catch (err) {
			toast.error(
				err instanceof ApiError ? err.message : 'Failed to download version.',
			);
		}
	}

	async function handleRestore(versionId: string, versionNumber: number) {
		try {
			await restoreVersion.mutateAsync(versionId);
			toast.success(`Restored version v${versionNumber} as latest`);
		} catch (err) {
			toast.error(
				err instanceof ApiError ? err.message : 'Failed to restore version.',
			);
		}
	}

	const versions = versionsQuery.data?.versions ?? [];
	const currentVersion = versionsQuery.data?.file.currentVersion ?? file?.currentVersion ?? 1;

	return (
		<Dialog open={Boolean(file)} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 truncate">
						<History className="size-4 shrink-0" aria-hidden="true" />
						<span className="truncate">Version History — {file?.name}</span>
					</DialogTitle>
					<DialogDescription>
						Every revision is retained in vault storage. Upload a new version or
						restore an earlier revision.
					</DialogDescription>
				</DialogHeader>

				<input
					ref={fileInputRef}
					type="file"
					onChange={handleUploadNewVersion}
					className="sr-only"
					aria-label="Upload new file version"
				/>

				<div className="flex items-center justify-between gap-2 pb-2 border-b border-border">
					<span className="text-xs font-mono text-muted-foreground">
						{versions.length} version{versions.length === 1 ? '' : 's'}
					</span>
					<Button
						type="button"
						size="xs"
						onClick={() => fileInputRef.current?.click()}
					>
						<Upload className="size-3.5" aria-hidden="true" />
						<span>Upload New Version</span>
					</Button>
				</div>

				<div className="space-y-2 max-h-72 overflow-y-auto pr-1">
					{versionsQuery.isLoading ? (
						<div className="text-xs text-muted-foreground py-6 text-center">
							Loading version history…
						</div>
					) : versions.length === 0 ? (
						<div className="text-xs text-muted-foreground py-6 text-center">
							No versions recorded yet.
						</div>
					) : (
						versions.map((ver) => {
							const isCurrent = ver.versionNumber === currentVersion;
							return (
								<div
									key={ver.id}
									className={`rounded-xl border p-3 flex items-center justify-between gap-3 ${
										isCurrent
											? 'border-primary bg-secondary/40'
											: 'border-border bg-card'
									}`}
								>
									<div className="space-y-1 min-w-0">
										<div className="flex items-center gap-2 flex-wrap">
											<span className="text-xs font-mono font-semibold">
												v{ver.versionNumber}
											</span>
											{isCurrent && (
												<Badge className="font-mono text-[10px]">Current</Badge>
											)}
											<span className="text-xs font-mono text-muted-foreground tabular-nums">
												{formatBytes(ver.sizeBytes)}
											</span>
										</div>
										<div className="text-[11px] font-mono text-muted-foreground truncate">
											{formatDate(ver.createdAt)}
											{ver.checksumSha256
												? ` · SHA256 ${ver.checksumSha256.slice(0, 10)}…`
												: ''}
										</div>
									</div>

									<div className="flex items-center gap-1.5 shrink-0">
										<Button
											type="button"
											variant="outline"
											size="xs"
											disabled={downloadVersion.isPending}
											onClick={() =>
												void handleDownload(ver.id, ver.versionNumber)
											}
										>
											<Download className="size-3" aria-hidden="true" />
											<span>Download</span>
										</Button>
										{!isCurrent && (
											<Button
												type="button"
												variant="outline"
												size="xs"
												disabled={restoreVersion.isPending}
												onClick={() =>
													void handleRestore(ver.id, ver.versionNumber)
												}
											>
												<RotateCcw className="size-3" aria-hidden="true" />
												<span>Restore</span>
											</Button>
										)}
									</div>
								</div>
							);
						})
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
