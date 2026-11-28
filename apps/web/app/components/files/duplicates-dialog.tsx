import { CopyCheck, Eye, Trash2 } from 'lucide-react';
import {
	type DuplicateGroupItem,
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

interface DuplicatesDialogProps {
	open: boolean;
	groups: DuplicateGroupItem[];
	totalWastedBytes: number;
	onClose: () => void;
	onPreview: (file: FileItem) => void;
	onDeleteFile: (file: FileItem) => void;
}

export function DuplicatesDialog({
	open,
	groups,
	totalWastedBytes,
	onClose,
	onPreview,
	onDeleteFile,
}: DuplicatesDialogProps) {
	return (
		<Dialog open={open} onOpenChange={(next) => !next && onClose()}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<CopyCheck className="size-4" aria-hidden="true" />
						<span>Duplicate Files Detected</span>
					</DialogTitle>
					<DialogDescription>
						Files sharing an identical SHA-256 checksum inside this workspace.
						Potential space savings:{' '}
						<span className="font-mono font-medium text-foreground">
							{formatBytes(totalWastedBytes)}
						</span>
						.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 max-h-96 overflow-y-auto pr-1">
					{groups.length === 0 ? (
						<div className="text-xs text-muted-foreground py-8 text-center">
							No duplicate files detected in this workspace.
						</div>
					) : (
						groups.map((group) => (
							<div
								key={group.checksumSha256}
								className="rounded-xl border border-border bg-secondary/30 p-3.5 space-y-2.5"
							>
								<div className="flex items-center justify-between gap-2 text-xs">
									<span className="font-mono text-muted-foreground">
										SHA-256 {group.checksumSha256.slice(0, 16)}…
									</span>
									<Badge variant="secondary" className="font-mono text-[10px]">
										{group.count} copies · {formatBytes(group.wastedBytes)}{' '}
										reclaimable
									</Badge>
								</div>

								<div className="space-y-1.5">
									{group.files.map((file) => (
										<div
											key={file.id}
											className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs"
										>
											<div className="min-w-0">
												<div className="font-medium truncate">{file.name}</div>
												<div className="text-[11px] font-mono text-muted-foreground tabular-nums">
													{formatBytes(file.sizeBytes)} ·{' '}
													{formatDate(file.createdAt)}
												</div>
											</div>
											<div className="flex items-center gap-1 shrink-0">
												<Button
													type="button"
													variant="ghost"
													size="xs"
													onClick={() => onPreview(file)}
												>
													<Eye className="size-3.5" aria-hidden="true" />
													<span>Preview</span>
												</Button>
												<Button
													type="button"
													variant="ghost"
													size="xs"
													className="text-destructive hover:text-destructive"
													onClick={() => onDeleteFile(file)}
												>
													<Trash2 className="size-3.5" aria-hidden="true" />
													<span>Trash</span>
												</Button>
											</div>
										</div>
									))}
								</div>
							</div>
						))
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
