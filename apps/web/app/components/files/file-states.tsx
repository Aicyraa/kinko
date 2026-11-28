import { AlertTriangle, FolderPlus, Upload } from 'lucide-react';
import { Button } from '../ui/button';

const LIST_SKEL_IDS = ['ls-1', 'ls-2', 'ls-3', 'ls-4', 'ls-5', 'ls-6'];
const GRID_SKEL_IDS = [
	'gs-1',
	'gs-2',
	'gs-3',
	'gs-4',
	'gs-5',
	'gs-6',
	'gs-7',
	'gs-8',
];

export function FileManagerSkeleton({ viewMode }: { viewMode: 'grid' | 'list' }) {
	if (viewMode === 'list') {
		return (
			<div
				role="status"
				aria-busy="true"
				className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border"
			>
				<span className="sr-only">Loading files…</span>
				{LIST_SKEL_IDS.map((id) => (
					<div
						key={id}
						className="flex items-center justify-between gap-4 px-4 py-3.5 animate-pulse"
					>
						<div className="flex items-center gap-3 flex-1">
							<div className="size-4 rounded bg-secondary" />
							<div className="size-8 rounded-lg bg-secondary" />
							<div className="h-4 w-44 rounded bg-secondary" />
						</div>
						<div className="h-3.5 w-20 rounded bg-secondary hidden sm:block" />
						<div className="h-3.5 w-24 rounded bg-secondary hidden md:block" />
					</div>
				))}
			</div>
		);
	}

	return (
		<div
			role="status"
			aria-busy="true"
			className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
		>
			<span className="sr-only">Loading files…</span>
			{GRID_SKEL_IDS.map((id) => (
				<div
					key={id}
					className="rounded-xl border border-border bg-card p-4 space-y-4 animate-pulse"
				>
					<div className="flex items-center justify-between">
						<div className="size-9 rounded-lg bg-secondary" />
						<div className="size-4 rounded bg-secondary" />
					</div>
					<div className="space-y-2">
						<div className="h-4 w-3/4 rounded bg-secondary" />
						<div className="h-3 w-1/2 rounded bg-secondary" />
					</div>
				</div>
			))}
		</div>
	);
}

export function FileManagerEmpty({
	isRoot,
	onUploadClick,
	onNewFolderClick,
}: {
	isRoot: boolean;
	onUploadClick: () => void;
	onNewFolderClick: () => void;
}) {
	return (
		<div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center space-y-4">
			<div className="size-12 rounded-xl bg-secondary border border-border flex items-center justify-center mx-auto">
				<Upload className="size-5 text-muted-foreground" aria-hidden="true" />
			</div>
			<div className="space-y-1.5 max-w-sm mx-auto">
				<h2 className="text-base font-semibold tracking-tight">
					{isRoot ? 'This vault is empty' : 'This folder is empty'}
				</h2>
				<p className="text-sm text-muted-foreground">
					Drag and drop files anywhere on this canvas, or create a folder to
					organize your assets.
				</p>
			</div>
			<div className="flex items-center justify-center gap-3 pt-1">
				<Button type="button" onClick={onUploadClick}>
					<Upload className="size-4" aria-hidden="true" />
					<span>Upload Files</span>
				</Button>
				<Button type="button" variant="outline" onClick={onNewFolderClick}>
					<FolderPlus className="size-4" aria-hidden="true" />
					<span>New Folder</span>
				</Button>
			</div>
		</div>
	);
}

export function FileManagerError({
	message,
	onRetry,
}: {
	message: string;
	onRetry: () => void;
}) {
	return (
		<div
			role="alert"
			className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center space-y-3"
		>
			<div className="size-10 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
				<AlertTriangle className="size-5" aria-hidden="true" />
			</div>
			<h2 className="text-base font-semibold tracking-tight">
				Could not load vault contents
			</h2>
			<p className="text-sm text-muted-foreground max-w-md mx-auto">
				{message}
			</p>
			<Button type="button" variant="outline" onClick={onRetry}>
				Try Again
			</Button>
		</div>
	);
}
