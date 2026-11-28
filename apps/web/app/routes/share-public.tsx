import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Download, FileText, Lock, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { type FormEvent, useId, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
	ApiError,
	api,
	formatBytes,
	formatDate,
	parseApiResponse,
} from '../lib/api';
import type { Route } from './+types/share-public';

export function meta(_: Route.MetaArgs) {
	return [{ title: 'Shared File — Kinko' }];
}

interface PublicShareMetadata {
	share: {
		id: string;
		requiresPassword: boolean;
		expiresAt: string | null;
		downloadCount: number;
	};
	file: {
		id: string;
		name: string;
		mimeType: string;
		sizeBytes: number;
		updatedAt: string;
	};
}

export default function PublicSharePage() {
	const { token = '' } = useParams();
	const [password, setPassword] = useState('');
	const [unlockError, setUnlockError] = useState<string | null>(null);
	const [downloading, setDownloading] = useState(false);
	const passwordId = useId();

	const metaQuery = useQuery({
		queryKey: ['public-share', token],
		enabled: Boolean(token),
		retry: false,
		queryFn: async (): Promise<PublicShareMetadata> => {
			const res = await api.api.v1.shares.public[':token'].$get({
				param: { token },
			});
			return parseApiResponse<PublicShareMetadata>(res);
		},
	});

	async function handleDownload(e?: FormEvent<HTMLFormElement>) {
		e?.preventDefault();
		if (!token) return;
		setUnlockError(null);
		setDownloading(true);
		try {
			const res = await api.api.v1.shares.public[':token'].access.$post({
				param: { token },
				json: {
					disposition: 'attachment',
					...(password ? { password } : {}),
				},
			});
			const payload = await parseApiResponse<{
				downloadUrl: string;
				file: { name: string };
			}>(res);

			const link = document.createElement('a');
			link.href = payload.downloadUrl;
			link.download = payload.file.name;
			link.rel = 'noopener noreferrer';
			document.body.appendChild(link);
			link.click();
			link.remove();

			toast.success(`Downloading "${payload.file.name}"`);
			void metaQuery.refetch();
		} catch (err) {
			const msg =
				err instanceof ApiError ? err.message : 'Unable to access shared file.';
			setUnlockError(msg);
		} finally {
			setDownloading(false);
		}
	}

	return (
		<div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6">
			<motion.div
				initial={{ opacity: 0, y: 12 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.28 }}
				className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm space-y-6"
			>
				<div className="flex items-center justify-between">
					<Link to="/" className="flex items-center gap-2.5">
						<div className="size-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-mono text-xs font-semibold">
							金
						</div>
						<span translate="no" className="font-semibold tracking-tight">
							Kinko Vault
						</span>
					</Link>
					<Badge variant="secondary" className="font-mono text-[10px] gap-1">
						<ShieldCheck className="size-3" aria-hidden="true" />
						Shared Link
					</Badge>
				</div>

				{metaQuery.isLoading ? (
					<div role="status" className="py-10 text-center text-sm text-muted-foreground">
						Verifying share link…
					</div>
				) : metaQuery.isError ? (
					<div className="py-6 text-center space-y-3">
						<div className="size-12 rounded-xl bg-secondary border border-border flex items-center justify-center mx-auto">
							<AlertTriangle
								className="size-5 text-muted-foreground"
								aria-hidden="true"
							/>
						</div>
						<h1 className="text-lg font-semibold tracking-tight">
							Share Link Unavailable
						</h1>
						<p className="text-sm text-muted-foreground">
							{metaQuery.error instanceof ApiError
								? metaQuery.error.message
								: 'This link may have expired or been revoked.'}
						</p>
					</div>
				) : metaQuery.data ? (
					<div className="space-y-6">
						<div className="rounded-xl border border-border bg-secondary/40 p-4 flex items-start gap-3.5">
							<div className="size-10 rounded-lg bg-card border border-border flex items-center justify-center shrink-0">
								<FileText className="size-5" aria-hidden="true" />
							</div>
							<div className="min-w-0 space-y-1">
								<h1 className="text-base font-semibold tracking-tight break-words">
									{metaQuery.data.file.name}
								</h1>
								<p className="text-xs font-mono text-muted-foreground tabular-nums">
									{formatBytes(metaQuery.data.file.sizeBytes)} · Updated{' '}
									{formatDate(metaQuery.data.file.updatedAt)}
								</p>
								{metaQuery.data.share.expiresAt && (
									<p className="text-[11px] font-mono text-muted-foreground">
										Expires {formatDate(metaQuery.data.share.expiresAt)}
									</p>
								)}
							</div>
						</div>

						{metaQuery.data.share.requiresPassword ? (
							<form onSubmit={handleDownload} className="space-y-4">
								<div className="space-y-1.5">
									<Label
										htmlFor={passwordId}
										className="flex items-center gap-1.5 text-xs"
									>
										<Lock className="size-3.5" aria-hidden="true" />
										<span>Password Required</span>
									</Label>
									<Input
										id={passwordId}
										type="password"
										autoComplete="current-password"
										placeholder="Enter share password…"
										value={password}
										onChange={(e) => setPassword(e.target.value)}
										required
									/>
									{unlockError && (
										<p role="alert" className="text-xs text-destructive">
											{unlockError}
										</p>
									)}
								</div>

								<Button
									type="submit"
									className="w-full"
									disabled={downloading || !password}
								>
									<Download className="size-4" aria-hidden="true" />
									<span>
										{downloading ? 'Verifying…' : 'Unlock & Download'}
									</span>
								</Button>
							</form>
						) : (
							<div className="space-y-3">
								{unlockError && (
									<p role="alert" className="text-xs text-destructive">
										{unlockError}
									</p>
								)}
								<Button
									type="button"
									className="w-full"
									disabled={downloading}
									onClick={() => void handleDownload()}
								>
									<Download className="size-4" aria-hidden="true" />
									<span>
										{downloading ? 'Preparing Download…' : 'Download File'}
									</span>
								</Button>
							</div>
						)}
					</div>
				) : null}
			</motion.div>
		</div>
	);
}
