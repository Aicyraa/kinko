import { useQueryClient } from '@tanstack/react-query';
import {
	Check,
	ChevronsUpDown,
	FolderOpen,
	LayoutDashboard,
	LogOut,
	Menu,
	Moon,
	Plus,
	Search,
	Settings,
	Star,
	Sun,
	Trash2,
	X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTheme } from 'next-themes';
import { type FormEvent, type ReactNode, useId, useState } from 'react';
import { NavLink } from 'react-router';
import { toast } from 'sonner';
import {
	type SessionPayload,
	useCreateTenant,
	useSetDefaultTenant,
	useSignOut,
	type WorkspaceTenant,
} from '../../hooks/use-auth';
import { ApiError, formatBytes, getStoredTenantId } from '../../lib/api';
import { UploadQueueDrawer } from '../files/upload-queue-drawer';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '../ui/dialog';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

interface AppShellProps {
	session: SessionPayload;
	children: ReactNode;
}

const NAV_ITEMS = [
	{ to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
	{ to: '/files', label: 'Files', icon: FolderOpen },
	{ to: '/search', label: 'Search', icon: Search },
	{ to: '/favorites', label: 'Favorites', icon: Star },
	{ to: '/trash', label: 'Trash', icon: Trash2 },
	{ to: '/settings', label: 'Settings', icon: Settings },
] as const;

export function getActiveTenant(
	session: SessionPayload,
): WorkspaceTenant | undefined {
	const storedId = getStoredTenantId();
	return (
		session.tenants.find((t) => t.id === storedId) ??
		session.tenants.find((t) => t.id === session.defaultTenantId) ??
		session.tenants[0]
	);
}

export function AppShell({ session, children }: AppShellProps) {
	const { theme, setTheme } = useTheme();
	const queryClient = useQueryClient();
	const signOut = useSignOut();
	const createTenant = useCreateTenant();
	const setDefaultTenant = useSetDefaultTenant();

	const [mobileNavOpen, setMobileNavOpen] = useState(false);
	const [createDialogOpen, setCreateDialogOpen] = useState(false);
	const [workspaceName, setWorkspaceName] = useState('');
	const workspaceInputId = useId();

	const activeTenant = getActiveTenant(session);
	const usedBytes = activeTenant?.analytics?.storageUsedBytes ?? 0;
	const quotaBytes = activeTenant?.storageQuotaBytes ?? 1;
	const usagePct = Math.min(100, Math.round((usedBytes / quotaBytes) * 100));

	const initials = (session.user.name || session.user.email)
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? '')
		.join('');

	async function handleSwitchTenant(tenant: WorkspaceTenant) {
		try {
			await setDefaultTenant.mutateAsync(tenant.id);
			await queryClient.invalidateQueries({ queryKey: ['vault'] });
			toast.success(`Switched to "${tenant.name}"`);
		} catch (err) {
			toast.error(
				err instanceof ApiError ? err.message : 'Failed to switch workspace.',
			);
		}
	}

	async function handleCreateWorkspace(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		if (!workspaceName.trim()) return;
		try {
			const { tenant } = await createTenant.mutateAsync({
				name: workspaceName.trim(),
			});
			await queryClient.invalidateQueries({ queryKey: ['vault'] });
			toast.success(`Created workspace "${tenant.name}"`);
			setWorkspaceName('');
			setCreateDialogOpen(false);
		} catch (err) {
			toast.error(
				err instanceof ApiError ? err.message : 'Could not create workspace.',
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

	const sidebarContent = (
		<div className="flex h-full flex-col justify-between p-4 gap-6">
			<div className="space-y-5">
				{/* Brand header */}
				<div className="flex items-center justify-between px-1">
					<div className="flex items-center gap-2.5">
						<div className="size-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-mono text-xs font-semibold">
							金
						</div>
						<span translate="no" className="font-semibold tracking-tight text-base">
							Kinko
						</span>
					</div>
					<button
						type="button"
						aria-label="Toggle theme"
						onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
						className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{theme === 'dark' ? (
							<Sun className="size-4" aria-hidden="true" />
						) : (
							<Moon className="size-4" aria-hidden="true" />
						)}
					</button>
				</div>

				{/* Workspace switcher */}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label="Switch workspace"
							className="w-full flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-left hover:bg-accent/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<div className="min-w-0">
								<div className="text-xs font-medium truncate">
									{activeTenant?.name ?? 'Select Workspace'}
								</div>
								<div className="text-[11px] font-mono text-muted-foreground mt-0.5">
									{activeTenant?.role ?? 'MEMBER'}
								</div>
							</div>
							<ChevronsUpDown
								className="size-4 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-60">
						<DropdownMenuLabel className="text-xs font-mono text-muted-foreground">
							Workspaces
						</DropdownMenuLabel>
						{session.tenants.map((tenant) => {
							const isSelected = tenant.id === activeTenant?.id;
							return (
								<DropdownMenuItem
									key={tenant.id}
									onClick={() => handleSwitchTenant(tenant)}
									className="flex items-center justify-between gap-2"
								>
									<span className="truncate">{tenant.name}</span>
									{isSelected && <Check className="size-3.5 shrink-0" />}
								</DropdownMenuItem>
							);
						})}
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={() => setCreateDialogOpen(true)}>
							<Plus className="size-4 mr-2" aria-hidden="true" />
							<span>New Workspace</span>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>

				{/* Primary navigation */}
				<nav aria-label="Vault navigation" className="space-y-1">
					{NAV_ITEMS.map(({ to, label, icon: Icon }) => (
						<NavLink
							key={to}
							to={to}
							onClick={() => setMobileNavOpen(false)}
							className={({ isActive }) =>
								`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
									isActive
										? 'text-primary-foreground'
										: 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
								}`
							}
						>
							{({ isActive }) => (
								<>
									{isActive && (
										<motion.span
											layoutId="sidebar-nav-pill"
											transition={{
												type: 'spring',
												stiffness: 420,
												damping: 34,
											}}
											className="absolute inset-0 rounded-lg bg-primary"
										/>
									)}
									<Icon
										className="size-4 relative z-10 shrink-0"
										aria-hidden="true"
									/>
									<span className="relative z-10">{label}</span>
								</>
							)}
						</NavLink>
					))}
				</nav>
			</div>

			<div className="space-y-4">
				{/* Storage usage card */}
				<div className="rounded-lg border border-border bg-card p-3 space-y-2">
					<div className="flex items-center justify-between text-xs">
						<span className="font-medium">Vault Storage</span>
						<span className="font-mono tabular-nums text-muted-foreground">
							{usagePct}%
						</span>
					</div>
					<div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
						<motion.div
							className="h-full rounded-full bg-primary"
							initial={{ width: 0 }}
							animate={{ width: `${Math.max(usagePct, usedBytes > 0 ? 2 : 0)}%` }}
							transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
						/>
					</div>
					<p className="text-[11px] font-mono tabular-nums text-muted-foreground">
						{formatBytes(usedBytes)} / {formatBytes(quotaBytes)}
					</p>
				</div>

				{/* Account footer */}
				<div className="pt-3 border-t border-border flex items-center justify-between gap-2">
					<div className="flex items-center gap-2.5 min-w-0">
						<div className="size-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold shrink-0">
							{initials || 'K'}
						</div>
						<div className="min-w-0">
							<div className="text-xs font-medium truncate">
								{session.user.name}
							</div>
							<div className="text-[11px] text-muted-foreground truncate font-mono">
								{session.user.email}
							</div>
						</div>
					</div>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Sign Out"
						onClick={handleSignOut}
						disabled={signOut.isPending}
					>
						<LogOut className="size-4" aria-hidden="true" />
					</Button>
				</div>
			</div>
		</div>
	);

	return (
		<div className="min-h-screen bg-background text-foreground flex">
			{/* Desktop Sidebar */}
			<aside className="hidden lg:block w-64 shrink-0 border-r border-border bg-sidebar sticky top-0 h-screen">
				{sidebarContent}
			</aside>

			{/* Mobile Drawer */}
			<AnimatePresence>
				{mobileNavOpen && (
					<div className="fixed inset-0 z-50 lg:hidden flex">
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							onClick={() => setMobileNavOpen(false)}
							className="fixed inset-0 bg-foreground/20 backdrop-blur-[1px]"
						/>
						<motion.aside
							initial={{ x: -280 }}
							animate={{ x: 0 }}
							exit={{ x: -280 }}
							transition={{ type: 'spring', stiffness: 380, damping: 34 }}
							className="relative z-10 w-64 bg-sidebar border-r border-border h-full"
						>
							<button
								type="button"
								aria-label="Close navigation"
								onClick={() => setMobileNavOpen(false)}
								className="absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground hover:text-foreground"
							>
								<X className="size-4" aria-hidden="true" />
							</button>
							{sidebarContent}
						</motion.aside>
					</div>
				)}
			</AnimatePresence>

			{/* Main Content */}
			<div className="flex-1 min-w-0 flex flex-col">
				<header className="lg:hidden h-14 border-b border-border bg-card px-4 flex items-center justify-between gap-3 sticky top-0 z-30">
					<div className="flex items-center gap-2.5 min-w-0">
						<button
							type="button"
							aria-label="Open navigation"
							onClick={() => setMobileNavOpen(true)}
							className="p-1.5 rounded-md hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<Menu className="size-5" aria-hidden="true" />
						</button>
						<span translate="no" className="font-semibold tracking-tight">
							Kinko
						</span>
						{activeTenant && (
							<Badge variant="secondary" className="truncate max-w-40 text-xs">
								{activeTenant.name}
							</Badge>
						)}
					</div>
				</header>

				<main className="flex-1 min-w-0">{children}</main>
			</div>

			{/* Create Workspace Dialog */}
			<Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
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
								onClick={() => setCreateDialogOpen(false)}
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

			<UploadQueueDrawer />
		</div>
	);
}
