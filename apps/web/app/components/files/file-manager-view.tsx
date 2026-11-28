import {
	ArrowDownUp,
	FolderPlus,
	LayoutGrid,
	List,
	Upload,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
	type ChangeEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { useDropzone } from 'react-dropzone';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useSession } from '../../hooks/use-auth';
import {
	type SortField,
	type SortOrder,
	useCreateFolder,
	useDeleteFile,
	useDeleteFolder,
	useDownloadFile,
	useFolderListing,
	useMoveFile,
	useMoveFolder,
	useRenameFile,
	useRenameFolder,
} from '../../hooks/use-files';
import { useUploadQueue } from '../../hooks/use-upload-queue';
import { ApiError } from '../../lib/api';
import { getActiveTenant } from '../layout/app-shell';
import { Button } from '../ui/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '../ui/select';
import { FileBreadcrumbs } from './file-breadcrumbs';
import {
	CreateFolderDialog,
	DeleteConfirmDialog,
	MoveItemsDialog,
	RenameItemDialog,
	type VaultTarget,
} from './file-dialogs';
import { FileGridView } from './file-grid-view';
import { FileListView } from './file-list-view';
import {
	FileManagerEmpty,
	FileManagerError,
	FileManagerSkeleton,
} from './file-states';
import { SelectionBar } from './selection-bar';

const VIEW_MODE_KEY = 'kinko:view-mode';

function readStoredViewMode(): 'grid' | 'list' {
	if (typeof window === 'undefined') return 'grid';
	return window.localStorage.getItem(VIEW_MODE_KEY) === 'list' ? 'list' : 'grid';
}

export function FileManagerView({ folderId }: { folderId: string | null }) {
	const { data: session } = useSession();
	const activeTenant = session ? getActiveTenant(session) : undefined;
	const tenantId = activeTenant?.id ?? null;

	const [searchParams, setSearchParams] = useSearchParams();
	const rawSort = searchParams.get('sort');
	const sortBy: SortField =
		rawSort === 'name' || rawSort === 'sizeBytes' || rawSort === 'updatedAt'
			? rawSort
			: 'name';
	const sortOrder: SortOrder =
		searchParams.get('order') === 'desc' ? 'desc' : 'asc';

	const [viewMode, setViewMode] = useState<'grid' | 'list'>(readStoredViewMode);
	const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

	const [createFolderOpen, setCreateFolderOpen] = useState(false);
	const [renameTarget, setRenameTarget] = useState<VaultTarget | null>(null);
	const [moveTargets, setMoveTargets] = useState<VaultTarget[]>([]);
	const [deleteTargets, setDeleteTargets] = useState<VaultTarget[]>([]);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const { enqueueFiles } = useUploadQueue();

	const listingQuery = useFolderListing(tenantId, folderId, sortBy, sortOrder);
	const createFolder = useCreateFolder(tenantId);
	const renameFolder = useRenameFolder(tenantId);
	const moveFolder = useMoveFolder(tenantId);
	const deleteFolder = useDeleteFolder(tenantId);
	const renameFile = useRenameFile(tenantId);
	const moveFile = useMoveFile(tenantId);
	const deleteFile = useDeleteFile(tenantId);
	const downloadFile = useDownloadFile(tenantId);

	// Clear selection when navigating folders or switching workspaces
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset selection on route/tenant change
	useEffect(() => {
		setSelectedKeys(new Set());
	}, [folderId, tenantId]);

	// Escape clears active selection
	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === 'Escape' && selectedKeys.size > 0) {
				setSelectedKeys(new Set());
			}
		}
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [selectedKeys.size]);

	const handleChangeViewMode = useCallback((mode: 'grid' | 'list') => {
		setViewMode(mode);
		if (typeof window !== 'undefined') {
			window.localStorage.setItem(VIEW_MODE_KEY, mode);
		}
	}, []);

	const handleSortChange = useCallback(
		(nextSort: SortField) => {
			setSearchParams((prev) => {
				const params = new URLSearchParams(prev);
				params.set('sort', nextSort);
				return params;
			});
		},
		[setSearchParams],
	);

	const handleToggleSortOrder = useCallback(() => {
		setSearchParams((prev) => {
			const params = new URLSearchParams(prev);
			params.set('order', sortOrder === 'asc' ? 'desc' : 'asc');
			return params;
		});
	}, [setSearchParams, sortOrder]);

	const onDrop = useCallback(
		(acceptedFiles: File[]) => {
			if (!tenantId || acceptedFiles.length === 0) return;
			enqueueFiles(acceptedFiles, { tenantId, folderId });
		},
		[enqueueFiles, folderId, tenantId],
	);

	const { getRootProps, getInputProps, isDragActive } = useDropzone({
		onDrop,
		noClick: true,
		noKeyboard: true,
	});

	function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
		const files = e.target.files ? Array.from(e.target.files) : [];
		if (tenantId && files.length > 0) {
			enqueueFiles(files, { tenantId, folderId });
		}
		e.target.value = '';
	}

	const folders = listingQuery.data?.folders ?? [];
	const files = listingQuery.data?.files ?? [];

	const allItemKeys = useMemo(() => {
		const keys: string[] = [];
		for (const f of folders) keys.push(`folder:${f.id}`);
		for (const fi of files) keys.push(`file:${fi.id}`);
		return keys;
	}, [folders, files]);

	const allSelected =
		allItemKeys.length > 0 && selectedKeys.size === allItemKeys.length;

	const selectedTargets = useMemo((): VaultTarget[] => {
		const result: VaultTarget[] = [];
		for (const f of folders) {
			if (selectedKeys.has(`folder:${f.id}`)) {
				result.push({
					kind: 'folder',
					id: f.id,
					name: f.name,
					parentFolderId: f.parentFolderId,
				});
			}
		}
		for (const fi of files) {
			if (selectedKeys.has(`file:${fi.id}`)) {
				result.push({
					kind: 'file',
					id: fi.id,
					name: fi.name,
					folderId: fi.folderId,
				});
			}
		}
		return result;
	}, [folders, files, selectedKeys]);

	function toggleSelect(key: string) {
		setSelectedKeys((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}

	function toggleSelectAll() {
		if (allSelected) {
			setSelectedKeys(new Set());
		} else {
			setSelectedKeys(new Set(allItemKeys));
		}
	}

	async function handleCreateFolder(name: string) {
		try {
			await createFolder.mutateAsync({ name, parentFolderId: folderId });
			toast.success(`Created folder "${name}"`);
			setCreateFolderOpen(false);
		} catch (err) {
			toast.error(
				err instanceof ApiError ? err.message : 'Failed to create folder.',
			);
		}
	}

	async function handleRename(target: VaultTarget, newName: string) {
		try {
			if (target.kind === 'folder') {
				await renameFolder.mutateAsync({ folderId: target.id, name: newName });
			} else {
				await renameFile.mutateAsync({ fileId: target.id, name: newName });
			}
			toast.success(`Renamed to "${newName}"`);
			setRenameTarget(null);
		} catch (err) {
			toast.error(
				err instanceof ApiError ? err.message : 'Failed to rename item.',
			);
		}
	}

	async function handleMove(destFolderId: string | null) {
		try {
			await Promise.all(
				moveTargets.map((target) =>
					target.kind === 'folder'
						? moveFolder.mutateAsync({
								folderId: target.id,
								targetParentFolderId: destFolderId,
							})
						: moveFile.mutateAsync({
								fileId: target.id,
								targetFolderId: destFolderId,
							}),
				),
			);
			toast.success(
				moveTargets.length === 1
					? `Moved "${moveTargets[0]?.name}"`
					: `Moved ${moveTargets.length} items`,
			);
			setMoveTargets([]);
			setSelectedKeys(new Set());
		} catch (err) {
			toast.error(
				err instanceof ApiError ? err.message : 'Failed to move item(s).',
			);
		}
	}

	async function handleDelete() {
		try {
			await Promise.all(
				deleteTargets.map((target) =>
					target.kind === 'folder'
						? deleteFolder.mutateAsync(target.id)
						: deleteFile.mutateAsync(target.id),
				),
			);
			toast.success(
				deleteTargets.length === 1
					? `Moved "${deleteTargets[0]?.name}" to Trash`
					: `Moved ${deleteTargets.length} items to Trash`,
			);
			setDeleteTargets([]);
			setSelectedKeys(new Set());
		} catch (err) {
			toast.error(
				err instanceof ApiError ? err.message : 'Failed to move item(s) to Trash.',
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

	const isEmpty =
		!listingQuery.isLoading &&
		!listingQuery.isError &&
		folders.length === 0 &&
		files.length === 0;

	return (
		<div
			{...getRootProps()}
			className="relative min-h-[calc(100vh-3.5rem)] lg:min-h-screen p-6 sm:p-8 max-w-6xl mx-auto space-y-6"
		>
			<input {...getInputProps()} />
			<input
				ref={fileInputRef}
				type="file"
				multiple
				onChange={handleFileInputChange}
				className="sr-only"
				aria-label="Choose files to upload"
			/>

			{/* Drag-and-drop Vault Overlay */}
			<AnimatePresence>
				{isDragActive && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15 }}
						className="fixed inset-0 z-50 bg-background/85 backdrop-blur-xs flex items-center justify-center p-6 pointer-events-none"
					>
						<motion.div
							initial={{ scale: 0.96 }}
							animate={{ scale: 1 }}
							className="max-w-md w-full rounded-2xl border-2 border-dashed border-primary bg-card p-10 text-center space-y-3 shadow-xl"
						>
							<div className="size-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center mx-auto">
								<Upload className="size-5" aria-hidden="true" />
							</div>
							<h2 className="text-lg font-semibold tracking-tight">
								Drop files to upload
							</h2>
							<p className="text-sm text-muted-foreground">
								Files will be uploaded directly to{' '}
								<span className="font-medium text-foreground">
									{listingQuery.data?.folder?.name ?? 'Vault Root'}
								</span>
								.
							</p>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Header & Primary Actions */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
				<div className="min-w-0 space-y-1">
					<h1 className="text-2xl font-semibold tracking-tight truncate">
						{listingQuery.data?.folder?.name ??
							activeTenant?.name ??
							'Files'}
					</h1>
					<FileBreadcrumbs
						breadcrumbs={listingQuery.data?.breadcrumbs ?? []}
					/>
				</div>

				<div className="flex flex-wrap items-center gap-2 shrink-0">
					<Button
						type="button"
						variant="outline"
						onClick={() => setCreateFolderOpen(true)}
					>
						<FolderPlus className="size-4" aria-hidden="true" />
						<span>New Folder</span>
					</Button>
					<Button
						type="button"
						onClick={() => fileInputRef.current?.click()}
					>
						<Upload className="size-4" aria-hidden="true" />
						<span>Upload Files</span>
					</Button>
				</div>
			</div>

			{/* Toolbar: Sorting & View Mode Toggle */}
			<div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-border">
				<div className="flex items-center gap-2">
					<Select
						value={sortBy}
						onValueChange={(val) => handleSortChange(val as SortField)}
					>
						<SelectTrigger
							aria-label="Sort files by"
							className="w-40 h-8 text-xs"
						>
							<SelectValue placeholder="Sort by" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="name">Sort: Name</SelectItem>
							<SelectItem value="sizeBytes">Sort: Size</SelectItem>
							<SelectItem value="updatedAt">Sort: Modified</SelectItem>
						</SelectContent>
					</Select>

					<Button
						type="button"
						variant="outline"
						size="xs"
						aria-label={`Sort direction: ${sortOrder === 'asc' ? 'ascending' : 'descending'}`}
						onClick={handleToggleSortOrder}
						className="h-8 px-2.5 font-mono"
					>
						<ArrowDownUp className="size-3.5" aria-hidden="true" />
						<span>{sortOrder.toUpperCase()}</span>
					</Button>
				</div>

				{/* Grid / List View Switcher */}
				<fieldset
					aria-label="View mode"
					className="inline-flex items-center rounded-lg bg-secondary p-1 border border-border m-0"
				>
					<button
						type="button"
						aria-label="Grid view"
						aria-pressed={viewMode === 'grid'}
						onClick={() => handleChangeViewMode('grid')}
						className="relative px-2.5 py-1 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{viewMode === 'grid' && (
							<motion.span
								layoutId="view-mode-pill"
								transition={{ type: 'spring', stiffness: 420, damping: 32 }}
								className="absolute inset-0 rounded-md bg-card shadow-xs border border-border"
							/>
						)}
						<span className="relative z-10 inline-flex items-center gap-1.5">
							<LayoutGrid className="size-3.5" aria-hidden="true" />
							<span>Grid</span>
						</span>
					</button>

					<button
						type="button"
						aria-label="List view"
						aria-pressed={viewMode === 'list'}
						onClick={() => handleChangeViewMode('list')}
						className="relative px-2.5 py-1 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{viewMode === 'list' && (
							<motion.span
								layoutId="view-mode-pill"
								transition={{ type: 'spring', stiffness: 420, damping: 32 }}
								className="absolute inset-0 rounded-md bg-card shadow-xs border border-border"
							/>
						)}
						<span className="relative z-10 inline-flex items-center gap-1.5">
							<List className="size-3.5" aria-hidden="true" />
							<span>List</span>
						</span>
					</button>
				</fieldset>
			</div>

			{/* States & Listing */}
			{listingQuery.isLoading ? (
				<FileManagerSkeleton viewMode={viewMode} />
			) : listingQuery.isError ? (
				<FileManagerError
					message={
						listingQuery.error instanceof Error
							? listingQuery.error.message
							: 'Unexpected error loading folder contents.'
					}
					onRetry={() => void listingQuery.refetch()}
				/>
			) : isEmpty ? (
				<FileManagerEmpty
					isRoot={!folderId}
					onUploadClick={() => fileInputRef.current?.click()}
					onNewFolderClick={() => setCreateFolderOpen(true)}
				/>
			) : viewMode === 'grid' ? (
				<FileGridView
					folders={folders}
					files={files}
					selectedKeys={selectedKeys}
					onToggleSelect={toggleSelect}
					onRename={setRenameTarget}
					onMove={(t) => setMoveTargets([t])}
					onDelete={(t) => setDeleteTargets([t])}
					onDownload={(id) => void handleDownload(id)}
				/>
			) : (
				<FileListView
					folders={folders}
					files={files}
					selectedKeys={selectedKeys}
					allSelected={allSelected}
					onToggleSelectAll={toggleSelectAll}
					onToggleSelect={toggleSelect}
					onRename={setRenameTarget}
					onMove={(t) => setMoveTargets([t])}
					onDelete={(t) => setDeleteTargets([t])}
					onDownload={(id) => void handleDownload(id)}
				/>
			)}

			<SelectionBar
				count={selectedTargets.length}
				onMove={() => setMoveTargets(selectedTargets)}
				onDelete={() => setDeleteTargets(selectedTargets)}
				onClear={() => setSelectedKeys(new Set())}
			/>

			<CreateFolderDialog
				open={createFolderOpen}
				onOpenChange={setCreateFolderOpen}
				onSubmit={handleCreateFolder}
				isPending={createFolder.isPending}
			/>

			<RenameItemDialog
				target={renameTarget}
				onClose={() => setRenameTarget(null)}
				onSubmit={handleRename}
				isPending={renameFolder.isPending || renameFile.isPending}
			/>

			<MoveItemsDialog
				tenantId={tenantId}
				targets={moveTargets}
				currentFolderId={folderId}
				onClose={() => setMoveTargets([])}
				onSubmit={handleMove}
				isPending={moveFolder.isPending || moveFile.isPending}
			/>

			<DeleteConfirmDialog
				targets={deleteTargets}
				onClose={() => setDeleteTargets([])}
				onConfirm={handleDelete}
				isPending={deleteFolder.isPending || deleteFile.isPending}
			/>
		</div>
	);
}
