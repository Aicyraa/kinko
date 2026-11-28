import { useQueryClient } from '@tanstack/react-query';
import { Check, FolderLock, Plus, Shield } from 'lucide-react';
import { motion } from 'motion/react';
import { type FormEvent, useId, useState } from 'react';
import { toast } from 'sonner';
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
	DialogTrigger,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
	AUTH_QUERY_KEY,
	useCreateTenant,
	useSession,
	useSetDefaultTenant,
} from '../hooks/use-auth';
import { ApiError, api, formatBytes, parseApiResponse } from '../lib/api';
import type { Route } from './+types/settings';

export function meta(_: Route.MetaArgs) {
	return [{ title: 'Settings — Kinko' }];
}

export default function SettingsPage() {
	const { data: session } = useSession();
	const queryClient = useQueryClient();
	const createTenant = useCreateTenant();
	const setDefaultTenant = useSetDefaultTenant();

	const [createOpen, setCreateOpen] = useState(false);
	const [newName, setNewName] = useState('');
	const [renameValue, setRenameValue] = useState('');
	const [renaming, setRenaming] = useState(false);

	const newNameId = useId();
	const renameId = useId();

	if (!session) return null;

	const activeTenant = getActiveTenant(session);

	async function handleCreate(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		if (!newName.trim()) return;
		try {
			const { tenant } = await createTenant.mutateAsync({
				name: newName.trim(),
			});
			await queryClient.invalidateQueries({ queryKey: ['vault'] });
			toast.success(`Created workspace "${tenant.name}"`);
			setNewName('');
			setCreateOpen(false);
		} catch (err) {
			toast.error(
				err instanceof ApiError ? err.message : 'Failed to create workspace.',
			);
		}
	}

	async function handleRenameActive(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		if (!activeTenant || !renameValue.trim()) return;
		setRenaming(true);
		try {
			const res = await api.api.v1.tenants[':tenantId'].$patch({
				param: { tenantId: activeTenant.id },
				json: { name: renameValue.trim() },
			});
			await parseApiResponse(res);
			await queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
			toast.success('Workspace renamed');
			setRenameValue('');
		} catch (err) {
			toast.error(
				err instanceof ApiError ? err.message : 'Failed to rename workspace.',
			);
		} finally {
			setRenaming(false);
		}
	}

	async function handleSwitch(tenantId: string, name: string) {
		try {
			await setDefaultTenant.mutateAsync(tenantId);
			await queryClient.invalidateQueries({ queryKey: ['vault'] });
			toast.success(`Switched active workspace to "${name}"`);
		} catch (err) {
			toast.error(
				err instanceof ApiError ? err.message : 'Could not switch workspace.',
			);
		}
	}

	return (
		<div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-8">
			<motion.div
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.25 }}
				className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
			>
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">
						Workspace &amp; Account Settings
					</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Manage your tenant-isolated vaults, quotas, and profile.
					</p>
				</div>

				<Dialog open={createOpen} onOpenChange={setCreateOpen}>
					<DialogTrigger asChild>
						<Button>
							<Plus className="size-4" aria-hidden="true" />
							<span>New Workspace</span>
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Create Workspace</DialogTitle>
							<DialogDescription>
								Provision a new tenant-isolated vault with its own 1&nbsp;GB
								storage quota.
							</DialogDescription>
						</DialogHeader>
						<form onSubmit={handleCreate} className="space-y-4">
							<div className="space-y-1.5">
								<Label htmlFor={newNameId}>Workspace Name</Label>
								<Input
									id={newNameId}
									value={newName}
									onChange={(e) => setNewName(e.target.value)}
									placeholder="Acme Design Archive…"
									required
								/>
							</div>
							<DialogFooter>
								<Button
									type="button"
									variant="outline"
									onClick={() => setCreateOpen(false)}
								>
									Cancel
								</Button>
								<Button type="submit" disabled={createTenant.isPending}>
									{createTenant.isPending ? 'Creating…' : 'Create Workspace'}
								</Button>
							</DialogFooter>
						</form>
					</DialogContent>
				</Dialog>
			</motion.div>

			{activeTenant && (
				<section className="rounded-xl border border-border bg-card p-6 space-y-4">
					<div>
						<h2 className="text-base font-semibold tracking-tight">
							Active Workspace
						</h2>
						<p className="text-xs text-muted-foreground mt-0.5">
							Currently selected: <span className="font-medium text-foreground">{activeTenant.name}</span>
						</p>
					</div>
					<form
						onSubmit={handleRenameActive}
						className="flex flex-col sm:flex-row gap-3 max-w-md"
					>
						<div className="flex-1 space-y-1.5">
							<Label htmlFor={renameId} className="sr-only">
								Rename Workspace
							</Label>
							<Input
								id={renameId}
								value={renameValue}
								onChange={(e) => setRenameValue(e.target.value)}
								placeholder={activeTenant.name}
							/>
						</div>
						<Button type="submit" variant="outline" disabled={renaming || !renameValue.trim()}>
							{renaming ? 'Saving…' : 'Rename'}
						</Button>
					</form>
				</section>
			)}

			<section className="space-y-4">
				<h2 className="text-base font-semibold tracking-tight">
					All Workspaces
				</h2>
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{session.tenants.map((tenant) => {
						const isActive = tenant.id === activeTenant?.id;
						const used = tenant.analytics?.storageUsedBytes ?? 0;

						return (
							<article
								key={tenant.id}
								className={`rounded-xl border bg-card p-5 flex flex-col justify-between gap-4 transition-colors ${
									isActive ? 'border-primary' : 'border-border'
								}`}
							>
								<div className="space-y-3">
									<div className="flex items-start justify-between gap-2">
										<div className="size-9 rounded-lg bg-secondary border border-border flex items-center justify-center">
											<FolderLock className="size-4" aria-hidden="true" />
										</div>
										<div className="flex items-center gap-1.5">
											<Badge variant="secondary" className="font-mono text-[10px]">
												{tenant.role}
											</Badge>
											{isActive && (
												<Badge className="font-mono text-[10px]">Active</Badge>
											)}
										</div>
									</div>

									<div>
										<h3 className="font-semibold tracking-tight truncate">
											{tenant.name}
										</h3>
										<p className="text-xs text-muted-foreground font-mono mt-1 tabular-nums">
											{formatBytes(used)} / {formatBytes(tenant.storageQuotaBytes)}
										</p>
									</div>
								</div>

								<div className="pt-3 border-t border-border flex items-center justify-between gap-2">
									<span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-mono">
										<Shield className="size-3.5" aria-hidden="true" />
										Isolated
									</span>
									{isActive ? (
										<span className="inline-flex items-center gap-1 text-xs font-medium">
											<Check className="size-3.5" aria-hidden="true" />
											Default
										</span>
									) : (
										<Button
											variant="outline"
											size="xs"
											disabled={setDefaultTenant.isPending}
											onClick={() => handleSwitch(tenant.id, tenant.name)}
										>
											Set Active
										</Button>
									)}
								</div>
							</article>
						);
					})}
				</div>
			</section>
		</div>
	);
}
