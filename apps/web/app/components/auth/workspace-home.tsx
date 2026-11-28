import {
	Check,
	FolderLock,
	Loader2,
	LogOut,
	Plus,
	Shield,
} from 'lucide-react';
import { motion } from 'motion/react';
import { type FormEvent, useId, useState } from 'react';
import { toast } from 'sonner';
import {
	type SessionPayload,
	useCreateTenant,
	useSetDefaultTenant,
	useSignOut,
} from '../../hooks/use-auth';
import { ApiError } from '../../lib/api';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

interface WorkspaceHomeProps {
	session: SessionPayload;
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.min(
		Math.floor(Math.log(bytes) / Math.log(1024)),
		units.length - 1,
	);
	const value = bytes / 1024 ** i;
	return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)} ${units[i]}`;
}

export function WorkspaceHome({ session }: WorkspaceHomeProps) {
	const signOut = useSignOut();
	const createTenant = useCreateTenant();
	const setDefaultTenant = useSetDefaultTenant();

	const [dialogOpen, setDialogOpen] = useState(false);
	const [workspaceName, setWorkspaceName] = useState('');
	const workspaceInputId = useId();

	async function handleCreateWorkspace(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		if (!workspaceName.trim()) return;
		try {
			const { tenant } = await createTenant.mutateAsync({
				name: workspaceName.trim(),
			});
			toast.success(`Created workspace "${tenant.name}"`);
			setWorkspaceName('');
			setDialogOpen(false);
		} catch (err) {
			toast.error(
				err instanceof ApiError ? err.message : 'Could not create workspace.',
			);
		}
	}

	async function handleSwitchDefault(tenantId: string, name: string) {
		try {
			await setDefaultTenant.mutateAsync(tenantId);
			toast.success(`Switched active workspace to "${name}"`);
		} catch (err) {
			toast.error(
				err instanceof ApiError ? err.message : 'Could not switch workspace.',
			);
		}
	}

	async function handleSignOut() {
		try {
			await signOut.mutateAsync();
			toast.success('Signed out');
		} catch (err) {
			toast.error(
				err instanceof ApiError ? err.message : 'Failed to sign out.',
			);
		}
	}

	return (
		<div className="min-h-screen bg-secondary text-foreground">
			<header className="border-b border-border bg-card">
				<div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
					<div className="flex items-center gap-3">
						<div className="size-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-mono text-xs font-semibold">
							金
						</div>
						<span translate="no" className="font-semibold tracking-tight">
							Kinko
						</span>
						<Badge variant="secondary" className="font-mono text-[11px]">
							Phase 1 · Auth &amp; Tenants
						</Badge>
					</div>

					<div className="flex items-center gap-3">
						<div className="hidden sm:block text-right">
							<div className="text-sm font-medium leading-none">
								{session.user.name}
							</div>
							<div className="text-xs text-muted-foreground font-mono mt-1">
								{session.user.email}
							</div>
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={handleSignOut}
							disabled={signOut.isPending}
						>
							{signOut.isPending ? (
								<Loader2 className="size-4 animate-spin" aria-hidden="true" />
							) : (
								<LogOut className="size-4" aria-hidden="true" />
							)}
							<span>{signOut.isPending ? 'Signing out…' : 'Sign Out'}</span>
						</Button>
					</div>
				</div>
			</header>

			<main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
				<motion.section
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
					className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
				>
					<div>
						<h1 className="text-2xl font-semibold tracking-tight text-balance">
							Your Workspaces
						</h1>
						<p className="text-sm text-muted-foreground mt-1">
							Tenant-isolated vaults provisioned for your account.
						</p>
					</div>

					<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
							<form onSubmit={handleCreateWorkspace} className="space-y-4">
								<div className="space-y-1.5">
									<Label htmlFor={workspaceInputId}>Workspace Name</Label>
									<Input
										id={workspaceInputId}
										name="workspaceName"
										autoComplete="off"
										placeholder="Acme Design Archive…"
										value={workspaceName}
										onChange={(e) => setWorkspaceName(e.target.value)}
										required
									/>
								</div>
								<DialogFooter>
									<Button
										type="button"
										variant="outline"
										onClick={() => setDialogOpen(false)}
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
				</motion.section>

				<section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{session.tenants.map((tenant, idx) => {
						const isDefault = tenant.id === session.defaultTenantId;
						const used = tenant.analytics?.storageUsedBytes ?? 0;

						return (
							<motion.article
								key={tenant.id}
								initial={{ opacity: 0, y: 12 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{
									duration: 0.28,
									delay: idx * 0.05,
									ease: [0.22, 1, 0.36, 1],
								}}
								className={`rounded-xl border bg-card p-5 flex flex-col justify-between gap-4 transition-colors ${
									isDefault ? 'border-primary' : 'border-border'
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
											{isDefault && (
												<Badge className="font-mono text-[10px]">Active</Badge>
											)}
										</div>
									</div>

									<div>
										<h2 className="font-semibold tracking-tight truncate">
											{tenant.name}
										</h2>
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
									{isDefault ? (
										<span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
											<Check className="size-3.5" aria-hidden="true" />
											Default
										</span>
									) : (
										<Button
											variant="outline"
											size="xs"
											disabled={setDefaultTenant.isPending}
											onClick={() =>
												handleSwitchDefault(tenant.id, tenant.name)
											}
										>
											Set Active
										</Button>
									)}
								</div>
							</motion.article>
						);
					})}
				</section>
			</main>
		</div>
	);
}
