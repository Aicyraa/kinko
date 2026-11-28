import { Folder, Home } from 'lucide-react';
import { type FormEvent, useEffect, useId, useMemo, useState } from 'react';
import { useAllFolders } from '../../hooks/use-files';
import type { FolderItem } from '../../lib/api';
import { Button } from '../ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

export type VaultTarget =
	| { kind: 'folder'; id: string; name: string; parentFolderId: string | null }
	| { kind: 'file'; id: string; name: string; folderId: string | null };

export function CreateFolderDialog({
	open,
	onOpenChange,
	onSubmit,
	isPending,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (name: string) => Promise<void>;
	isPending: boolean;
}) {
	const [name, setName] = useState('');
	const inputId = useId();

	useEffect(() => {
		if (open) setName('');
	}, [open]);

	async function handleSubmit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		if (!name.trim()) return;
		await onSubmit(name.trim());
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>New Folder</DialogTitle>
					<DialogDescription>
						Create a folder in the current directory.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor={inputId}>Folder Name</Label>
						<Input
							id={inputId}
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Design Assets…"
							autoComplete="off"
							required
							disabled={isPending}
						/>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isPending || !name.trim()}>
							{isPending ? 'Creating…' : 'Create Folder'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function RenameItemDialog({
	target,
	onClose,
	onSubmit,
	isPending,
}: {
	target: VaultTarget | null;
	onClose: () => void;
	onSubmit: (target: VaultTarget, newName: string) => Promise<void>;
	isPending: boolean;
}) {
	const [name, setName] = useState('');
	const inputId = useId();

	useEffect(() => {
		if (target) setName(target.name);
	}, [target]);

	async function handleSubmit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		if (!target || !name.trim()) return;
		await onSubmit(target, name.trim());
	}

	return (
		<Dialog open={Boolean(target)} onOpenChange={(o) => !o && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						Rename {target?.kind === 'folder' ? 'Folder' : 'File'}
					</DialogTitle>
					<DialogDescription>
						Enter a new name for{' '}
						<span className="font-medium text-foreground">{target?.name}</span>.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor={inputId}>Name</Label>
						<Input
							id={inputId}
							value={name}
							onChange={(e) => setName(e.target.value)}
							autoComplete="off"
							required
							disabled={isPending}
						/>
					</div>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={isPending || !name.trim()}>
							{isPending ? 'Saving…' : 'Save Name'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function collectDescendantIds(
	folders: FolderItem[],
	sourceIds: Set<string>,
): Set<string> {
	const blocked = new Set<string>(sourceIds);
	let added = true;
	while (added) {
		added = false;
		for (const folder of folders) {
			if (
				folder.parentFolderId &&
				blocked.has(folder.parentFolderId) &&
				!blocked.has(folder.id)
			) {
				blocked.add(folder.id);
				added = true;
			}
		}
	}
	return blocked;
}

export function MoveItemsDialog({
	tenantId,
	targets,
	currentFolderId,
	onClose,
	onSubmit,
	isPending,
}: {
	tenantId: string | null | undefined;
	targets: VaultTarget[];
	currentFolderId: string | null;
	onClose: () => void;
	onSubmit: (targetFolderId: string | null) => Promise<void>;
	isPending: boolean;
}) {
	const open = targets.length > 0;
	const { data: allFolders = [], isLoading } = useAllFolders(
		open ? tenantId : null,
	);
	const [selectedDest, setSelectedDest] = useState<string | null>(
		currentFolderId,
	);

	useEffect(() => {
		if (open) {
			setSelectedDest(currentFolderId);
		}
	}, [open, currentFolderId]);

	const blockedFolderIds = useMemo(() => {
		const movingFolderIds = new Set(
			targets.filter((t) => t.kind === 'folder').map((t) => t.id),
		);
		return collectDescendantIds(allFolders, movingFolderIds);
	}, [allFolders, targets]);

	const folderDepths = useMemo(() => {
		const byId = new Map(allFolders.map((f) => [f.id, f]));
		const depths = new Map<string, number>();
		for (const folder of allFolders) {
			let d = 0;
			let cur = folder.parentFolderId;
			const seen = new Set<string>([folder.id]);
			while (cur && !seen.has(cur)) {
				seen.add(cur);
				d += 1;
				cur = byId.get(cur)?.parentFolderId ?? null;
			}
			depths.set(folder.id, d);
		}
		return depths;
	}, [allFolders]);

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						Move{' '}
						{targets.length === 1
							? `"${targets[0]?.name}"`
							: `${targets.length} items`}
					</DialogTitle>
					<DialogDescription>
						Choose a destination folder inside your workspace.
					</DialogDescription>
				</DialogHeader>

				<div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border overscroll-contain">
					<button
						type="button"
						onClick={() => setSelectedDest(null)}
						className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors ${
							selectedDest === null
								? 'bg-primary text-primary-foreground font-medium'
								: 'hover:bg-secondary'
						}`}
					>
						<Home className="size-4 shrink-0" aria-hidden="true" />
						<span>Vault Root</span>
					</button>

					{isLoading ? (
						<div className="p-4 text-xs text-muted-foreground">
							Loading folders…
						</div>
					) : (
						allFolders.map((folder) => {
							const isBlocked = blockedFolderIds.has(folder.id);
							const isSelected = selectedDest === folder.id;
							const depth = folderDepths.get(folder.id) ?? 0;

							return (
								<button
									key={folder.id}
									type="button"
									disabled={isBlocked}
									onClick={() => setSelectedDest(folder.id)}
									style={{ paddingLeft: `${12 + depth * 16}px` }}
									className={`w-full flex items-center gap-2.5 pr-3 py-2.5 text-sm text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
										isSelected
											? 'bg-primary text-primary-foreground font-medium'
											: 'hover:bg-secondary'
									}`}
								>
									<Folder className="size-4 shrink-0" aria-hidden="true" />
									<span className="truncate">{folder.name}</span>
								</button>
							);
						})
					)}
				</div>

				<DialogFooter>
					<Button type="button" variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button
						type="button"
						disabled={isPending}
						onClick={() => void onSubmit(selectedDest)}
					>
						{isPending ? 'Moving…' : 'Move Here'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function DeleteConfirmDialog({
	targets,
	onClose,
	onConfirm,
	isPending,
}: {
	targets: VaultTarget[];
	onClose: () => void;
	onConfirm: () => Promise<void>;
	isPending: boolean;
}) {
	const open = targets.length > 0;
	const label =
		targets.length === 1
			? `"${targets[0]?.name}"`
			: `${targets.length} selected items`;

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Move to Trash</DialogTitle>
					<DialogDescription>
						Are you sure you want to move{' '}
						<span className="font-medium text-foreground">{label}</span> to
						Trash? Soft-deleted items can be restored later.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button
						type="button"
						variant="destructive"
						disabled={isPending}
						onClick={() => void onConfirm()}
					>
						{isPending ? 'Moving to Trash…' : 'Move to Trash'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
