import {
	Download,
	Eye,
	Folder,
	FolderInput,
	MoreVertical,
	Pencil,
	Trash2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import { type FileItem, type FolderItem, formatBytes, formatDate } from '../../lib/api';
import { Checkbox } from '../ui/checkbox';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import type { VaultTarget } from './file-dialogs';
import { FileTypeIcon, getFileKindLabel } from './file-icon';

interface FileGridViewProps {
	folders: FolderItem[];
	files: FileItem[];
	selectedKeys: Set<string>;
	onToggleSelect: (key: string) => void;
	onRename: (target: VaultTarget) => void;
	onMove: (target: VaultTarget) => void;
	onDelete: (target: VaultTarget) => void;
	onDownload: (fileId: string) => void;
	onPreview: (file: FileItem) => void;
}

export function FileGridView({
	folders,
	files,
	selectedKeys,
	onToggleSelect,
	onRename,
	onMove,
	onDelete,
	onDownload,
	onPreview,
}: FileGridViewProps) {
	return (
		<div className="space-y-6">
			{folders.length > 0 && (
				<section aria-label="Folders" className="space-y-3">
					<h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
						Folders ({folders.length})
					</h2>
					<div className="grid gap-3.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{folders.map((folder, idx) => {
							const selKey = `folder:${folder.id}`;
							const isSelected = selectedKeys.has(selKey);
							const target: VaultTarget = {
								kind: 'folder',
								id: folder.id,
								name: folder.name,
								parentFolderId: folder.parentFolderId,
							};

							return (
								<motion.article
									key={folder.id}
									initial={{ opacity: 0, y: 8 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{
										duration: 0.22,
										delay: Math.min(idx * 0.025, 0.2),
									}}
									className={`group rounded-xl border bg-card p-4 transition-colors transition-shadow hover:shadow-xs ${
										isSelected
											? 'border-primary ring-2 ring-primary/20'
											: 'border-border hover:border-foreground/30'
									}`}
								>
									<div className="flex items-start justify-between gap-2">
										<Link
											to={`/files/${folder.id}`}
											className="flex items-center gap-3 min-w-0 flex-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										>
											<div className="size-9 rounded-lg bg-secondary border border-border flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
												<Folder className="size-4" aria-hidden="true" />
											</div>
											<div className="min-w-0">
												<div className="text-sm font-medium truncate">
													{folder.name}
												</div>
												<div className="text-[11px] font-mono text-muted-foreground">
													{formatDate(folder.updatedAt)}
												</div>
											</div>
										</Link>

										<div className="flex items-center gap-1 shrink-0">
											<Checkbox
												aria-label={`Select ${folder.name}`}
												checked={isSelected}
												onCheckedChange={() => onToggleSelect(selKey)}
											/>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<button
														type="button"
														aria-label={`Actions for ${folder.name}`}
														className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
													>
														<MoreVertical
															className="size-4"
															aria-hidden="true"
														/>
													</button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem onClick={() => onRename(target)}>
														<Pencil className="size-4 mr-2" aria-hidden="true" />
														Rename
													</DropdownMenuItem>
													<DropdownMenuItem onClick={() => onMove(target)}>
														<FolderInput
															className="size-4 mr-2"
															aria-hidden="true"
														/>
														Move
													</DropdownMenuItem>
													<DropdownMenuSeparator />
													<DropdownMenuItem
														onClick={() => onDelete(target)}
														className="text-destructive focus:text-destructive"
													>
														<Trash2 className="size-4 mr-2" aria-hidden="true" />
														Move to Trash
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</div>
									</div>
								</motion.article>
							);
						})}
					</div>
				</section>
			)}

			{files.length > 0 && (
				<section aria-label="Files" className="space-y-3">
					<h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
						Files ({files.length})
					</h2>
					<div className="grid gap-3.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{files.map((file, idx) => {
							const selKey = `file:${file.id}`;
							const isSelected = selectedKeys.has(selKey);
							const target: VaultTarget = {
								kind: 'file',
								id: file.id,
								name: file.name,
								folderId: file.folderId,
							};

							return (
								<motion.article
									key={file.id}
									initial={{ opacity: 0, y: 8 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{
										duration: 0.22,
										delay: Math.min(idx * 0.025, 0.2),
									}}
									className={`group rounded-xl border bg-card p-4 flex flex-col justify-between gap-4 transition-colors transition-shadow hover:shadow-xs ${
										isSelected
											? 'border-primary ring-2 ring-primary/20'
											: 'border-border hover:border-foreground/30'
									}`}
								>
									<div className="flex items-start justify-between gap-2">
										<div className="size-9 rounded-lg bg-secondary border border-border flex items-center justify-center shrink-0">
											<FileTypeIcon
												mimeType={file.mimeType}
												fileName={file.name}
												className="size-4"
											/>
										</div>

										<div className="flex items-center gap-1 shrink-0">
											<Checkbox
												aria-label={`Select ${file.name}`}
												checked={isSelected}
												onCheckedChange={() => onToggleSelect(selKey)}
											/>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<button
														type="button"
														aria-label={`Actions for ${file.name}`}
														className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
													>
														<MoreVertical
															className="size-4"
															aria-hidden="true"
														/>
													</button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem onClick={() => onPreview(file)}>
														<Eye className="size-4 mr-2" aria-hidden="true" />
														Preview
													</DropdownMenuItem>
													<DropdownMenuItem
														onClick={() => onDownload(file.id)}
													>
														<Download
															className="size-4 mr-2"
															aria-hidden="true"
														/>
														Download
													</DropdownMenuItem>
													<DropdownMenuItem onClick={() => onRename(target)}>
														<Pencil className="size-4 mr-2" aria-hidden="true" />
														Rename
													</DropdownMenuItem>
													<DropdownMenuItem onClick={() => onMove(target)}>
														<FolderInput
															className="size-4 mr-2"
															aria-hidden="true"
														/>
														Move
													</DropdownMenuItem>
													<DropdownMenuSeparator />
													<DropdownMenuItem
														onClick={() => onDelete(target)}
														className="text-destructive focus:text-destructive"
													>
														<Trash2 className="size-4 mr-2" aria-hidden="true" />
														Move to Trash
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</div>
									</div>

									<div className="space-y-1 min-w-0">
										<button
											type="button"
											onClick={() => onPreview(file)}
											title={file.name}
											className="w-full text-left text-sm font-medium truncate hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
										>
											{file.name}
										</button>
										<div className="flex items-center justify-between gap-2 text-[11px] font-mono text-muted-foreground tabular-nums">
											<span>{getFileKindLabel(file.mimeType, file.name)}</span>
											<span>{formatBytes(file.sizeBytes)}</span>
										</div>
									</div>
								</motion.article>
							);
						})}
					</div>
				</section>
			)}
		</div>
	);
}
