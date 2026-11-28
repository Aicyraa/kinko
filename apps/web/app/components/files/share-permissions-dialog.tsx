import {
	Check,
	Copy,
	KeyRound,
	Link2,
	Lock,
	Shield,
	Trash2,
	UserPlus,
} from 'lucide-react';
import { motion } from 'motion/react';
import { type FormEvent, useId, useState } from 'react';
import { toast } from 'sonner';
import {
	useCreateShare,
	useFilePermissions,
	useFileShares,
	useRemoveFilePermission,
	useRevokeShare,
	useTenantMembers,
	useUpsertFilePermission,
} from '../../hooks/use-advanced';
import { ApiError, type FileItem, formatDate } from '../../lib/api';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '../ui/select';

interface SharePermissionsDialogProps {
	file: FileItem | null;
	tenantId: string | null;
	onClose: () => void;
}

export function SharePermissionsDialog({
	file,
	tenantId,
	onClose,
}: SharePermissionsDialogProps) {
	const [activeTab, setActiveTab] = useState<'shares' | 'permissions'>('shares');
	const [password, setPassword] = useState('');
	const [expiryHours, setExpiryHours] = useState<string>('168');
	const [createdUrl, setCreatedUrl] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	const [selectedMemberId, setSelectedMemberId] = useState<string>('');
	const [selectedRole, setSelectedRole] = useState<'VIEWER' | 'EDITOR' | 'OWNER'>(
		'VIEWER',
	);

	const passwordInputId = useId();

	const fileId = file?.id ?? null;
	const sharesQuery = useFileShares(tenantId, fileId);
	const permissionsQuery = useFilePermissions(tenantId, fileId);
	const membersQuery = useTenantMembers(tenantId);

	const createShare = useCreateShare(tenantId);
	const revokeShare = useRevokeShare(tenantId, fileId);
	const upsertPermission = useUpsertFilePermission(tenantId, fileId);
	const removePermission = useRemoveFilePermission(tenantId, fileId);

	async function handleCreateShare(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		if (!file) return;
		try {
			const res = await createShare.mutateAsync({
				fileId: file.id,
				...(password.trim() ? { password: password.trim() } : {}),
				expiresInHours:
					expiryHours === 'never' ? null : Number.parseInt(expiryHours, 10),
			});
			const fullUrl =
				typeof window !== 'undefined'
					? `${window.location.origin}${res.sharePath}`
					: res.sharePath;
			setCreatedUrl(fullUrl);
			setPassword('');
			setCopied(false);
			toast.success('Share link created');
		} catch (err) {
			toast.error(
				err instanceof ApiError ? err.message : 'Could not create share link.',
			);
		}
	}

	async function handleCopyUrl(url: string) {
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			toast.success('Share link copied to clipboard');
		} catch {
			toast.error('Failed to copy link');
		}
	}

	async function handleRevoke(shareId: string) {
		try {
			await revokeShare.mutateAsync(shareId);
			toast.success('Share link revoked');
		} catch (err) {
			toast.error(
				err instanceof ApiError ? err.message : 'Failed to revoke share link.',
			);
		}
	}

	async function handleGrantPermission(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		if (!selectedMemberId) return;
		try {
			await upsertPermission.mutateAsync({
				userId: selectedMemberId,
				role: selectedRole,
			});
			toast.success('File permission saved');
		} catch (err) {
			toast.error(
				err instanceof ApiError ? err.message : 'Could not update permission.',
			);
		}
	}

	async function handleRemovePermission(userId: string) {
		try {
			await removePermission.mutateAsync(userId);
			toast.success('Permission removed');
		} catch (err) {
			toast.error(
				err instanceof ApiError ? err.message : 'Failed to remove permission.',
			);
		}
	}

	const members = membersQuery.data?.members ?? [];

	return (
		<Dialog
			open={Boolean(file)}
			onOpenChange={(open) => {
				if (!open) {
					setCreatedUrl(null);
					setPassword('');
					onClose();
				}
			}}
		>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle className="truncate">
						Share &amp; Access — {file?.name}
					</DialogTitle>
					<DialogDescription>
						Create revocable public share links or configure per-user file
						permissions.
					</DialogDescription>
				</DialogHeader>

				{/* Animated Tab Switcher */}
				<fieldset
					aria-label="Share and access sections"
					className="inline-flex items-center rounded-lg bg-secondary p-1 border border-border w-fit m-0"
				>
					<button
						type="button"
						onClick={() => setActiveTab('shares')}
						className="relative px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
					>
						{activeTab === 'shares' && (
							<motion.span
								layoutId="share-dialog-tab"
								transition={{ type: 'spring', stiffness: 420, damping: 32 }}
								className="absolute inset-0 rounded-md bg-card shadow-xs border border-border"
							/>
						)}
						<span className="relative z-10 inline-flex items-center gap-1.5">
							<Link2 className="size-3.5" aria-hidden="true" />
							<span>Share Links</span>
						</span>
					</button>

					<button
						type="button"
						onClick={() => setActiveTab('permissions')}
						className="relative px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
					>
						{activeTab === 'permissions' && (
							<motion.span
								layoutId="share-dialog-tab"
								transition={{ type: 'spring', stiffness: 420, damping: 32 }}
								className="absolute inset-0 rounded-md bg-card shadow-xs border border-border"
							/>
						)}
						<span className="relative z-10 inline-flex items-center gap-1.5">
							<Shield className="size-3.5" aria-hidden="true" />
							<span>Permissions</span>
						</span>
					</button>
				</fieldset>

				{activeTab === 'shares' ? (
					<div className="space-y-4">
						<form
							onSubmit={handleCreateShare}
							className="rounded-xl border border-border bg-secondary/40 p-4 space-y-3"
						>
							<div className="grid gap-3 sm:grid-cols-2">
								<div className="space-y-1.5">
									<Label htmlFor={passwordInputId} className="text-xs">
										Optional Password
									</Label>
									<Input
										id={passwordInputId}
										type="password"
										autoComplete="new-password"
										placeholder="Leave blank for open link…"
										value={password}
										onChange={(e) => setPassword(e.target.value)}
									/>
								</div>

								<div className="space-y-1.5">
									<Label className="text-xs">Expiration</Label>
									<Select value={expiryHours} onValueChange={setExpiryHours}>
										<SelectTrigger aria-label="Share expiration" className="h-9">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="24">24 hours</SelectItem>
											<SelectItem value="168">7 days</SelectItem>
											<SelectItem value="720">30 days</SelectItem>
											<SelectItem value="never">Never expires</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>

							<div className="flex justify-end">
								<Button
									type="submit"
									size="sm"
									disabled={createShare.isPending}
								>
									<Link2 className="size-3.5" aria-hidden="true" />
									<span>
										{createShare.isPending ? 'Creating…' : 'Create Share Link'}
									</span>
								</Button>
							</div>
						</form>

						{createdUrl && (
							<motion.div
								initial={{ opacity: 0, y: 6 }}
								animate={{ opacity: 1, y: 0 }}
								className="rounded-xl border border-primary bg-card p-3 space-y-2"
							>
								<div className="text-xs font-medium">
									New Share Link Ready (copy now — token is hashed after
									creation)
								</div>
								<div className="flex items-center gap-2">
									<Input
										readOnly
										value={createdUrl}
										aria-label="Generated share URL"
										className="font-mono text-xs h-8"
									/>
									<Button
										type="button"
										size="sm"
										variant="outline"
										onClick={() => void handleCopyUrl(createdUrl)}
									>
										{copied ? (
											<Check className="size-3.5" aria-hidden="true" />
										) : (
											<Copy className="size-3.5" aria-hidden="true" />
										)}
										<span>{copied ? 'Copied' : 'Copy'}</span>
									</Button>
								</div>
							</motion.div>
						)}

						<div className="space-y-2 max-h-56 overflow-y-auto pr-1">
							<div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
								Existing Links ({sharesQuery.data?.shares.length ?? 0})
							</div>
							{sharesQuery.isLoading ? (
								<div className="text-xs text-muted-foreground py-4 text-center">
									Loading share links…
								</div>
							) : sharesQuery.isError ? (
								<div className="text-xs text-destructive py-4 text-center">
									{sharesQuery.error instanceof Error
										? sharesQuery.error.message
										: 'Owner permission required to manage share links.'}
								</div>
							) : (sharesQuery.data?.shares.length ?? 0) === 0 ? (
								<div className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
									No share links created for this file yet.
								</div>
							) : (
								sharesQuery.data?.shares.map((share) => (
									<div
										key={share.id}
										className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-xs"
									>
										<div className="space-y-1 min-w-0">
											<div className="flex items-center gap-1.5 flex-wrap">
												<Badge
													variant={
														share.status === 'ACTIVE' ? 'default' : 'secondary'
													}
													className="font-mono text-[10px]"
												>
													{share.status}
												</Badge>
												{share.hasPassword && (
													<Badge
														variant="outline"
														className="font-mono text-[10px] gap-1"
													>
														<Lock className="size-2.5" aria-hidden="true" />
														Protected
													</Badge>
												)}
												<span className="font-mono text-muted-foreground">
													{share.downloadCount} downloads
												</span>
											</div>
											<div className="text-[11px] font-mono text-muted-foreground">
												Created {formatDate(share.createdAt)}
												{share.expiresAt
													? ` · Expires ${formatDate(share.expiresAt)}`
													: ' · No expiry'}
											</div>
										</div>
										{share.status === 'ACTIVE' && (
											<Button
												type="button"
												variant="outline"
												size="xs"
												disabled={revokeShare.isPending}
												onClick={() => void handleRevoke(share.id)}
											>
												Revoke
											</Button>
										)}
									</div>
								))
							)}
						</div>
					</div>
				) : (
					<div className="space-y-4">
						<div className="flex items-center justify-between text-xs rounded-lg border border-border bg-secondary/40 px-3 py-2">
							<span className="text-muted-foreground">Your effective role</span>
							<Badge className="font-mono text-[10px]">
								{permissionsQuery.data?.effectiveRole ?? '—'}
							</Badge>
						</div>

						<form
							onSubmit={handleGrantPermission}
							className="flex flex-col sm:flex-row gap-2 items-end rounded-xl border border-border bg-secondary/40 p-3"
						>
							<div className="flex-1 w-full space-y-1">
								<Label className="text-xs">Workspace Member</Label>
								<Select
									value={selectedMemberId}
									onValueChange={setSelectedMemberId}
								>
									<SelectTrigger aria-label="Select workspace member" className="h-9">
										<SelectValue placeholder="Choose member…" />
									</SelectTrigger>
									<SelectContent>
										{members.map((m) => (
											<SelectItem key={m.userId} value={m.userId}>
												{m.name || m.email || m.userId}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="w-full sm:w-32 space-y-1">
								<Label className="text-xs">Role</Label>
								<Select
									value={selectedRole}
									onValueChange={(v) =>
										setSelectedRole(v as 'VIEWER' | 'EDITOR' | 'OWNER')
									}
								>
									<SelectTrigger aria-label="Select permission role" className="h-9">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="VIEWER">VIEWER</SelectItem>
										<SelectItem value="EDITOR">EDITOR</SelectItem>
										<SelectItem value="OWNER">OWNER</SelectItem>
									</SelectContent>
								</Select>
							</div>

							<Button
								type="submit"
								size="sm"
								disabled={!selectedMemberId || upsertPermission.isPending}
								className="h-9 shrink-0"
							>
								<UserPlus className="size-3.5" aria-hidden="true" />
								<span>Grant</span>
							</Button>
						</form>

						<div className="space-y-2 max-h-56 overflow-y-auto pr-1">
							<div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
								Explicit Permissions (
								{permissionsQuery.data?.permissions.length ?? 0})
							</div>
							{permissionsQuery.isLoading ? (
								<div className="text-xs text-muted-foreground py-4 text-center">
									Loading permissions…
								</div>
							) : (permissionsQuery.data?.permissions.length ?? 0) === 0 ? (
								<div className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
									No explicit overrides. Workspace members inherit default
									collaborative access.
								</div>
							) : (
								permissionsQuery.data?.permissions.map((perm) => (
									<div
										key={perm.id}
										className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-xs"
									>
										<div className="flex items-center gap-2.5 min-w-0">
											<KeyRound
												className="size-3.5 text-muted-foreground shrink-0"
												aria-hidden="true"
											/>
											<div className="min-w-0">
												<div className="font-medium truncate">
													{perm.userName || perm.userEmail || perm.userId}
												</div>
												{perm.userEmail && (
													<div className="text-[11px] font-mono text-muted-foreground truncate">
														{perm.userEmail}
													</div>
												)}
											</div>
										</div>

										<div className="flex items-center gap-2 shrink-0">
											<Badge variant="secondary" className="font-mono text-[10px]">
												{perm.role}
											</Badge>
											<Button
												type="button"
												variant="ghost"
												size="icon-xs"
												aria-label={`Remove permission for ${perm.userName || perm.userId}`}
												disabled={removePermission.isPending}
												onClick={() => void handleRemovePermission(perm.userId)}
											>
												<Trash2 className="size-3.5" aria-hidden="true" />
											</Button>
										</div>
									</div>
								))
							)}
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
