import {
	Download,
	Folder,
	FolderInput,
	MoreHorizontal,
	Pencil,
	Trash2,
} from 'lucide-react';
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '../ui/table';
import type { VaultTarget } from './file-dialogs';
import { FileTypeIcon, getFileKindLabel } from './file-icon';

interface FileListViewProps {
	folders: FolderItem[];
	files: FileItem[];
	selectedKeys: Set<string>;
	allSelected: boolean;
	onToggleSelectAll: () => void;
	onToggleSelect: (key: string) => void;
	onRename: (target: VaultTarget) => void;
	onMove: (target: VaultTarget) => void;
	onDelete: (target: VaultTarget) => void;
	onDownload: (fileId: string) => void;
}

export function FileListView({
	folders,
	files,
	selectedKeys,
	allSelected,
	onToggleSelectAll,
	onToggleSelect,
	onRename,
	onMove,
	onDelete,
	onDownload,
}: FileListViewProps) {
	return (
		<div className="rounded-xl border border-border bg-card overflow-hidden">
			<Table>
				<TableHeader>
					<TableRow className="bg-secondary/60 hover:bg-secondary/60">
						<TableHead className="w-10">
							<Checkbox
								aria-label="Select all items"
								checked={allSelected}
								onCheckedChange={onToggleSelectAll}
							/>
						</TableHead>
						<TableHead>Name</TableHead>
						<TableHead className="hidden sm:table-cell">Type</TableHead>
						<TableHead className="hidden md:table-cell">Size</TableHead>
						<TableHead className="hidden lg:table-cell">Modified</TableHead>
						<TableHead className="w-12 text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{folders.map((folder) => {
						const selKey = `folder:${folder.id}`;
						const isSelected = selectedKeys.has(selKey);
						const target: VaultTarget = {
							kind: 'folder',
							id: folder.id,
							name: folder.name,
							parentFolderId: folder.parentFolderId,
						};

						return (
							<TableRow
								key={folder.id}
								data-state={isSelected ? 'selected' : undefined}
							>
								<TableCell>
									<Checkbox
										aria-label={`Select ${folder.name}`}
										checked={isSelected}
										onCheckedChange={() => onToggleSelect(selKey)}
									/>
								</TableCell>
								<TableCell className="max-w-xs">
									<Link
										to={`/files/${folder.id}`}
										className="flex items-center gap-3 font-medium hover:underline min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
									>
										<div className="size-7 rounded-md bg-secondary border border-border flex items-center justify-center shrink-0">
											<Folder className="size-3.5" aria-hidden="true" />
										</div>
										<span className="truncate">{folder.name}</span>
									</Link>
								</TableCell>
								<TableCell className="hidden sm:table-cell text-xs font-mono text-muted-foreground">
									Folder
								</TableCell>
								<TableCell className="hidden md:table-cell text-xs font-mono text-muted-foreground">
									—
								</TableCell>
								<TableCell className="hidden lg:table-cell text-xs font-mono text-muted-foreground">
									{formatDate(folder.updatedAt)}
								</TableCell>
								<TableCell className="text-right">
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<button
												type="button"
												aria-label={`Actions for ${folder.name}`}
												className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											>
												<MoreHorizontal className="size-4" aria-hidden="true" />
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
								</TableCell>
							</TableRow>
						);
					})}

					{files.map((file) => {
						const selKey = `file:${file.id}`;
						const isSelected = selectedKeys.has(selKey);
						const target: VaultTarget = {
							kind: 'file',
							id: file.id,
							name: file.name,
							folderId: file.folderId,
						};

						return (
							<TableRow
								key={file.id}
								data-state={isSelected ? 'selected' : undefined}
							>
								<TableCell>
									<Checkbox
										aria-label={`Select ${file.name}`}
										checked={isSelected}
										onCheckedChange={() => onToggleSelect(selKey)}
									/>
								</TableCell>
								<TableCell className="max-w-xs">
									<div className="flex items-center gap-3 min-w-0">
										<div className="size-7 rounded-md bg-secondary border border-border flex items-center justify-center shrink-0">
											<FileTypeIcon
												mimeType={file.mimeType}
												fileName={file.name}
												className="size-3.5"
											/>
										</div>
										<span className="font-medium truncate">{file.name}</span>
									</div>
								</TableCell>
								<TableCell className="hidden sm:table-cell text-xs font-mono text-muted-foreground">
									{getFileKindLabel(file.mimeType, file.name)}
								</TableCell>
								<TableCell className="hidden md:table-cell text-xs font-mono text-muted-foreground tabular-nums">
									{formatBytes(file.sizeBytes)}
								</TableCell>
								<TableCell className="hidden lg:table-cell text-xs font-mono text-muted-foreground">
									{formatDate(file.updatedAt)}
								</TableCell>
								<TableCell className="text-right">
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<button
												type="button"
												aria-label={`Actions for ${file.name}`}
												className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											>
												<MoreHorizontal className="size-4" aria-hidden="true" />
											</button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem onClick={() => onDownload(file.id)}>
												<Download className="size-4 mr-2" aria-hidden="true" />
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
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
}
