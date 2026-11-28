import {
	Check,
	ChevronLeft,
	ChevronRight,
	Copy,
	Download,
	ExternalLink,
	Loader2,
	RotateCcw,
	X,
	ZoomIn,
	ZoomOut,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
	api,
	type FileItem,
	formatBytes,
	formatDate,
	parseApiResponse,
	tenantHeaders,
} from '../../lib/api';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import { getFileKindLabel } from './file-icon';

interface FilePreviewModalProps {
	file: FileItem | null;
	files?: FileItem[];
	tenantId: string | null | undefined;
	onClose: () => void;
	onSelectFile?: (file: FileItem) => void;
}

type PreviewKind = 'image' | 'pdf' | 'text' | 'audio' | 'video' | 'unsupported';

function resolvePreviewKind(file: FileItem): PreviewKind {
	const mime = file.mimeType.toLowerCase();
	const name = file.name.toLowerCase();
	if (mime.startsWith('image/')) return 'image';
	if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
	if (mime.startsWith('audio/')) return 'audio';
	if (mime.startsWith('video/')) return 'video';
	if (
		mime.startsWith('text/') ||
		mime.includes('json') ||
		mime.includes('sql') ||
		mime.includes('xml') ||
		mime.includes('javascript') ||
		mime.includes('typescript') ||
		/\.(ts|tsx|js|jsx|json|md|sql|txt|yaml|yml|css|html|csv|env|sh)$/i.test(
			name,
		)
	) {
		return 'text';
	}
	return 'unsupported';
}

export function FilePreviewModal({
	file,
	files = [],
	tenantId,
	onClose,
	onSelectFile,
}: FilePreviewModalProps) {
	const [inlineUrl, setInlineUrl] = useState<string | null>(null);
	const [textContent, setTextContent] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [zoom, setZoom] = useState(1);
	const [copied, setCopied] = useState(false);

	const previewKind = file ? resolvePreviewKind(file) : 'unsupported';
	const currentIndex = file ? files.findIndex((f) => f.id === file.id) : -1;
	const hasPrev = currentIndex > 0;
	const hasNext = currentIndex >= 0 && currentIndex < files.length - 1;

	useEffect(() => {
		if (!file || !tenantId) {
			setInlineUrl(null);
			setTextContent(null);
			setErrorMsg(null);
			return;
		}

		let cancelled = false;
		setLoading(true);
		setErrorMsg(null);
		setInlineUrl(null);
		setTextContent(null);
		setZoom(1);
		setCopied(false);

		async function loadPreview(target: FileItem, activeTenantId: string) {
			try {
				const res = await api.api.v1.files[':fileId'].download.$get(
					{ param: { fileId: target.id }, query: { disposition: 'inline' } },
					{ headers: tenantHeaders(activeTenantId) },
				);
				const payload = await parseApiResponse<{ downloadUrl: string }>(res);
				if (cancelled) return;
				setInlineUrl(payload.downloadUrl);

				if (resolvePreviewKind(target) === 'text') {
					if (target.sizeBytes > 1024 * 1024) {
						setErrorMsg('File is larger than 1 MB; download to view.');
						return;
					}
					const textRes = await fetch(payload.downloadUrl);
					if (!textRes.ok) {
						throw new Error(`Could not fetch text preview (${textRes.status})`);
					}
					const text = await textRes.text();
					if (!cancelled) {
						setTextContent(text);
					}
				}
			} catch (err) {
				if (!cancelled) {
					setErrorMsg(
						err instanceof Error ? err.message : 'Unable to load preview.',
					);
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		}

		void loadPreview(file, tenantId);
		return () => {
			cancelled = true;
		};
	}, [file, tenantId]);

	useEffect(() => {
		if (!file || !onSelectFile) return;
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === 'ArrowLeft' && hasPrev) {
				const prev = files[currentIndex - 1];
				if (prev) onSelectFile?.(prev);
			} else if (e.key === 'ArrowRight' && hasNext) {
				const next = files[currentIndex + 1];
				if (next) onSelectFile?.(next);
			}
		}
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [currentIndex, file, files, hasNext, hasPrev, onSelectFile]);

	async function handleCopyText() {
		if (!textContent) return;
		await navigator.clipboard.writeText(textContent);
		setCopied(true);
		setTimeout(() => setCopied(false), 1800);
	}

	async function handleDownload() {
		if (!file || !tenantId) return;
		const res = await api.api.v1.files[':fileId'].download.$get(
			{ param: { fileId: file.id }, query: { disposition: 'attachment' } },
			{ headers: tenantHeaders(tenantId) },
		);
		const payload = await parseApiResponse<{ downloadUrl: string }>(res);
		const link = document.createElement('a');
		link.href = payload.downloadUrl;
		link.download = file.name;
		link.rel = 'noopener noreferrer';
		document.body.appendChild(link);
		link.click();
		link.remove();
	}

	const textEntries =
		textContent !== null && file
			? textContent.split('\n').map((text, n) => ({
					id: `${file.id}-L${n + 1}`,
					num: n + 1,
					text,
				}))
			: [];

	return (
		<Dialog open={Boolean(file)} onOpenChange={(o) => !o && onClose()}>
			<DialogContent
				showCloseButton={false}
				className="max-w-5xl w-[calc(100vw-2rem)] h-[85vh] p-0 flex flex-col gap-0 overflow-hidden"
			>
				{file && (
					<>
						<header className="px-4 sm:px-6 py-3.5 border-b border-border bg-card flex items-center justify-between gap-3 shrink-0">
							<div className="min-w-0 flex items-center gap-3">
								<DialogTitle className="text-sm sm:text-base font-semibold truncate">
									{file.name}
								</DialogTitle>
								<Badge variant="secondary" className="font-mono text-[10px] shrink-0">
									{getFileKindLabel(file.mimeType, file.name)}
								</Badge>
								<span className="hidden sm:inline text-xs font-mono text-muted-foreground tabular-nums shrink-0">
									{formatBytes(file.sizeBytes)} · {formatDate(file.updatedAt)}
								</span>
							</div>

							<div className="flex items-center gap-1.5 shrink-0">
								{onSelectFile && files.length > 1 && (
									<>
										<Button
											type="button"
											variant="outline"
											size="icon-sm"
											aria-label="Previous file"
											disabled={!hasPrev}
											onClick={() => {
												const prev = files[currentIndex - 1];
												if (prev) onSelectFile(prev);
											}}
										>
											<ChevronLeft className="size-4" aria-hidden="true" />
										</Button>
										<Button
											type="button"
											variant="outline"
											size="icon-sm"
											aria-label="Next file"
											disabled={!hasNext}
											onClick={() => {
												const next = files[currentIndex + 1];
												if (next) onSelectFile(next);
											}}
										>
											<ChevronRight className="size-4" aria-hidden="true" />
										</Button>
									</>
								)}

								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => void handleDownload()}
								>
									<Download className="size-4" aria-hidden="true" />
									<span className="hidden sm:inline">Download</span>
								</Button>

								<button
									type="button"
									aria-label="Close preview"
									onClick={onClose}
									className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<X className="size-4" aria-hidden="true" />
								</button>
							</div>
						</header>

						<div className="flex-1 min-h-0 bg-secondary/50 relative overflow-auto overscroll-contain flex flex-col">
							{loading ? (
								<div className="flex-1 flex items-center justify-center gap-2.5 text-sm text-muted-foreground">
									<Loader2 className="size-4 animate-spin" aria-hidden="true" />
									<span>Loading preview…</span>
								</div>
							) : errorMsg ? (
								<div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
									<p className="text-sm text-muted-foreground">{errorMsg}</p>
									<Button
										type="button"
										variant="outline"
										onClick={() => void handleDownload()}
									>
										<Download className="size-4" aria-hidden="true" />
										<span>Download File</span>
									</Button>
								</div>
							) : previewKind === 'image' && inlineUrl ? (
								<div className="flex-1 flex flex-col min-h-0">
									<div className="flex items-center justify-center gap-2 py-2 border-b border-border bg-card/80">
										<Button
											type="button"
											variant="outline"
											size="icon-xs"
											aria-label="Zoom out"
											onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
										>
											<ZoomOut className="size-3.5" aria-hidden="true" />
										</Button>
										<span className="text-xs font-mono tabular-nums w-12 text-center">
											{Math.round(zoom * 100)}%
										</span>
										<Button
											type="button"
											variant="outline"
											size="icon-xs"
											aria-label="Zoom in"
											onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
										>
											<ZoomIn className="size-3.5" aria-hidden="true" />
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="icon-xs"
											aria-label="Reset zoom"
											onClick={() => setZoom(1)}
										>
											<RotateCcw className="size-3.5" aria-hidden="true" />
										</Button>
									</div>
									<div className="flex-1 overflow-auto flex items-center justify-center p-6">
										<img
											src={inlineUrl}
											alt={file.name}
											style={{ transform: `scale(${zoom})` }}
											className="max-w-full max-h-full object-contain rounded-lg border border-border bg-card transition-transform origin-center"
										/>
									</div>
								</div>
							) : previewKind === 'pdf' && inlineUrl ? (
								<div className="flex-1 flex flex-col min-h-0">
									<div className="flex items-center justify-end px-4 py-2 border-b border-border bg-card/80">
										<a
											href={inlineUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
										>
											<ExternalLink className="size-3.5" aria-hidden="true" />
											<span>Open in New Tab</span>
										</a>
									</div>
									<iframe
										src={inlineUrl}
										title={file.name}
										className="w-full flex-1 border-0 bg-card"
									/>
								</div>
							) : previewKind === 'text' && textContent !== null ? (
								<div className="flex-1 flex flex-col min-h-0 bg-card">
									<div className="flex items-center justify-between px-4 py-2 border-b border-border bg-secondary/50">
										<span className="text-xs font-mono text-muted-foreground">
											{textEntries.length} lines · {file.mimeType}
										</span>
										<Button
											type="button"
											variant="outline"
											size="xs"
											onClick={() => void handleCopyText()}
										>
											{copied ? (
												<>
													<Check className="size-3.5" aria-hidden="true" />
													<span>Copied</span>
												</>
											) : (
												<>
													<Copy className="size-3.5" aria-hidden="true" />
													<span>Copy</span>
												</>
											)}
										</Button>
									</div>
									<div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed">
										<table className="w-full border-collapse">
											<tbody>
												{textEntries.map((entry) => (
													<tr key={entry.id}>
														<td className="select-none pr-4 text-right text-muted-foreground/60 tabular-nums align-top w-10">
															{entry.num}
														</td>
														<td className="whitespace-pre-wrap break-words text-foreground">
															{entry.text || ' '}
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</div>
							) : previewKind === 'audio' && inlineUrl ? (
								<div className="flex-1 flex flex-col items-center justify-center p-8 space-y-4">
									<div className="rounded-2xl border border-border bg-card p-6 w-full max-w-md space-y-4 text-center">
										<p className="text-sm font-medium truncate">{file.name}</p>
										{/* biome-ignore lint/a11y/useMediaCaption: user-uploaded audio asset */}
										<audio controls src={inlineUrl} className="w-full" />
									</div>
								</div>
							) : previewKind === 'video' && inlineUrl ? (
								<div className="flex-1 flex items-center justify-center p-6">
									{/* biome-ignore lint/a11y/useMediaCaption: user-uploaded video asset */}
									<video
										controls
										src={inlineUrl}
										className="max-w-full max-h-full rounded-xl border border-border bg-primary"
									/>
								</div>
							) : (
								<div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
									<p className="text-sm text-muted-foreground">
										Inline preview is not available for{' '}
										<span className="font-mono text-foreground">
											{file.mimeType}
										</span>
										.
									</p>
									<Button type="button" onClick={() => void handleDownload()}>
										<Download className="size-4" aria-hidden="true" />
										<span>Download File</span>
									</Button>
								</div>
							)}
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
