import {
	ChevronLeft,
	ChevronRight,
	Download,
	Eye,
	RotateCcw,
	Search as SearchIcon,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useId, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { FileTypeIcon, getFileKindLabel } from '../components/files/file-icon';
import { FilePreviewModal } from '../components/files/file-preview-modal';
import { getActiveTenant } from '../components/layout/app-shell';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '../components/ui/select';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '../components/ui/table';
import { useSession } from '../hooks/use-auth';
import { useDownloadFile } from '../hooks/use-files';
import { type SearchFileType, useSearchFiles } from '../hooks/use-search';
import { ApiError, type FileItem, formatBytes, formatDate } from '../lib/api';
import type { Route } from './+types/search';

export function meta(_: Route.MetaArgs) {
	return [{ title: 'Search — Kinko' }];
}

type SizePreset = 'any' | 'tiny' | 'small' | 'medium' | 'large';

const SIZE_RANGES: Record<
	SizePreset,
	{ minSize?: number; maxSize?: number }
> = {
	any: {},
	tiny: { maxSize: 100 * 1024 },
	small: { minSize: 100 * 1024, maxSize: 1024 * 1024 },
	medium: { minSize: 1024 * 1024, maxSize: 25 * 1024 * 1024 },
	large: { minSize: 25 * 1024 * 1024 },
};

const TYPE_OPTIONS: Array<{ value: SearchFileType; label: string }> = [
	{ value: 'all', label: 'All Types' },
	{ value: 'image', label: 'Images' },
	{ value: 'pdf', label: 'PDF' },
	{ value: 'text', label: 'Text / Code' },
	{ value: 'audio', label: 'Audio' },
	{ value: 'video', label: 'Video' },
	{ value: 'archive', label: 'Archives' },
];

const SEARCH_SKEL_KEYS = ['ss-1', 'ss-2', 'ss-3', 'ss-4', 'ss-5'];

export default function SearchPage() {
	const { data: session } = useSession();
	const activeTenant = session ? getActiveTenant(session) : undefined;
	const tenantId = activeTenant?.id ?? null;

	const [searchParams, setSearchParams] = useSearchParams();
	const qParam = searchParams.get('q') ?? '';
	const typeParam = (searchParams.get('type') as SearchFileType) || 'all';
	const dateFrom = searchParams.get('from') ?? '';
	const dateTo = searchParams.get('to') ?? '';
	const sizePreset = (searchParams.get('size') as SizePreset) || 'any';
	const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);

	const [inputQuery, setInputQuery] = useState(qParam);
	const [previewFile, setPreviewFile] = useState<FileItem | null>(null);

	const qInputId = useId();
	const fromInputId = useId();
	const toInputId = useId();

	const downloadFile = useDownloadFile(tenantId);

	useEffect(() => {
		setInputQuery(qParam);
	}, [qParam]);

	// Debounce filename query into URL
	useEffect(() => {
		const timer = setTimeout(() => {
			if (inputQuery === qParam) return;
			setSearchParams((prev) => {
				const next = new URLSearchParams(prev);
				if (inputQuery.trim()) {
					next.set('q', inputQuery.trim());
				} else {
					next.delete('q');
				}
				next.set('page', '1');
				return next;
			});
		}, 250);
		return () => clearTimeout(timer);
	}, [inputQuery, qParam, setSearchParams]);

	function updateFilter(key: string, value: string) {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			if (value && value !== 'all' && value !== 'any') {
				next.set(key, value);
			} else {
				next.delete(key);
			}
			next.set('page', '1');
			return next;
		});
	}

	function setPage(nextPage: number) {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			next.set('page', String(nextPage));
			return next;
		});
	}

	function resetAll() {
		setInputQuery('');
		setSearchParams(new URLSearchParams());
	}

	const sizeBounds = SIZE_RANGES[sizePreset] ?? {};
	const searchQuery = useSearchFiles(tenantId, {
		q: qParam,
		type: typeParam,
		dateFrom,
		dateTo,
		...sizeBounds,
		page,
		limit: 12,
	});

	const items = searchQuery.data?.items ?? [];
	const pagination = searchQuery.data?.pagination ?? {
		page: 1,
		limit: 12,
		total: 0,
		totalPages: 1,
	};

	const hasFilters = Boolean(
		qParam || typeParam !== 'all' || dateFrom || dateTo || sizePreset !== 'any',
	);

	async function handleDownload(fileId: string) {
		try {
			await downloadFile.mutateAsync(fileId);
		} catch (err) {
			toast.error(
				err instanceof ApiError ? err.message : 'Failed to download file.',
			);
		}
	}

	return (
		<div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-6">
			<motion.div
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.22 }}
				className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
			>
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">
						Search Vault
					</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Filter files across{' '}
						<span className="font-medium text-foreground">
							{activeTenant?.name ?? 'your workspace'}
						</span>{' '}
						by filename, type, upload date, and size.
					</p>
				</div>

				{hasFilters && (
					<Button type="button" variant="outline" size="sm" onClick={resetAll}>
						<RotateCcw className="size-3.5" aria-hidden="true" />
						<span>Reset Filters</span>
					</Button>
				)}
			</motion.div>

			{/* Search & Filter Controls */}
			<section
				aria-label="Search filters"
				className="rounded-xl border border-border bg-card p-4 space-y-4"
			>
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
					<div className="lg:col-span-2 space-y-1.5">
						<Label htmlFor={qInputId}>Filename</Label>
						<div className="relative">
							<SearchIcon
								className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2"
								aria-hidden="true"
							/>
							<Input
								id={qInputId}
								value={inputQuery}
								onChange={(e) => setInputQuery(e.target.value)}
								placeholder="Search by filename…"
								className="pl-9"
							/>
						</div>
					</div>

					<div className="space-y-1.5">
						<Label>File Type</Label>
						<Select
							value={typeParam}
							onValueChange={(val) => updateFilter('type', val)}
						>
							<SelectTrigger aria-label="Filter by file type">
								<SelectValue placeholder="All Types" />
							</SelectTrigger>
							<SelectContent>
								{TYPE_OPTIONS.map((opt) => (
									<SelectItem key={opt.value} value={opt.value}>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-1.5">
						<Label>File Size</Label>
						<Select
							value={sizePreset}
							onValueChange={(val) => updateFilter('size', val)}
						>
							<SelectTrigger aria-label="Filter by file size">
								<SelectValue placeholder="Any Size" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="any">Any Size</SelectItem>
								<SelectItem value="tiny">&lt; 100 KB</SelectItem>
								<SelectItem value="small">100 KB – 1 MB</SelectItem>
								<SelectItem value="medium">1 MB – 25 MB</SelectItem>
								<SelectItem value="large">&gt; 25 MB</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className="grid grid-cols-2 gap-2">
						<div className="space-y-1.5">
							<Label htmlFor={fromInputId}>From</Label>
							<Input
								id={fromInputId}
								type="date"
								value={dateFrom}
								onChange={(e) => updateFilter('from', e.target.value)}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor={toInputId}>To</Label>
							<Input
								id={toInputId}
								type="date"
								value={dateTo}
								onChange={(e) => updateFilter('to', e.target.value)}
							/>
						</div>
					</div>
				</div>
			</section>

			{/* Results */}
			{searchQuery.isLoading ? (
				<div
					role="status"
					aria-busy="true"
					className="rounded-xl border border-border bg-card divide-y divide-border"
				>
					<span className="sr-only">Searching files…</span>
					{SEARCH_SKEL_KEYS.map((key) => (
						<div
							key={key}
							className="flex items-center justify-between px-4 py-4 animate-pulse"
						>
							<div className="h-4 w-56 rounded bg-secondary" />
							<div className="h-4 w-24 rounded bg-secondary" />
						</div>
					))}
				</div>
			) : searchQuery.isError ? (
				<div
					role="alert"
					className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center space-y-3"
				>
					<p className="text-sm text-muted-foreground">
						{searchQuery.error instanceof Error
							? searchQuery.error.message
							: 'Search failed.'}
					</p>
					<Button
						type="button"
						variant="outline"
						onClick={() => void searchQuery.refetch()}
					>
						Try Again
					</Button>
				</div>
			) : items.length === 0 ? (
				<div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center space-y-3">
					<SearchIcon
						className="size-8 text-muted-foreground mx-auto"
						aria-hidden="true"
					/>
					<h2 className="text-base font-semibold tracking-tight">
						No matching files found
					</h2>
					<p className="text-sm text-muted-foreground max-w-sm mx-auto">
						Try adjusting your search terms or clearing active filters.
					</p>
				</div>
			) : (
				<>
					<div className="rounded-xl border border-border bg-card overflow-hidden">
						<Table>
							<TableHeader>
								<TableRow className="bg-secondary/60 hover:bg-secondary/60">
									<TableHead>Name</TableHead>
									<TableHead className="hidden sm:table-cell">Type</TableHead>
									<TableHead className="hidden md:table-cell">Size</TableHead>
									<TableHead className="hidden lg:table-cell">
										Uploaded
									</TableHead>
									<TableHead className="text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{items.map((file) => (
									<TableRow key={file.id}>
										<TableCell className="max-w-xs">
											<button
												type="button"
												onClick={() => setPreviewFile(file)}
												className="flex items-center gap-3 min-w-0 max-w-full text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
											>
												<div className="size-8 rounded-md bg-secondary border border-border flex items-center justify-center shrink-0">
													<FileTypeIcon
														mimeType={file.mimeType}
														fileName={file.name}
														className="size-4"
													/>
												</div>
												<span className="font-medium truncate">
													{file.name}
												</span>
											</button>
										</TableCell>
										<TableCell className="hidden sm:table-cell text-xs font-mono text-muted-foreground">
											{getFileKindLabel(file.mimeType, file.name)}
										</TableCell>
										<TableCell className="hidden md:table-cell text-xs font-mono text-muted-foreground tabular-nums">
											{formatBytes(file.sizeBytes)}
										</TableCell>
										<TableCell className="hidden lg:table-cell text-xs font-mono text-muted-foreground">
											{formatDate(file.createdAt)}
										</TableCell>
										<TableCell className="text-right">
											<div className="inline-flex items-center gap-1.5">
												<Button
													type="button"
													variant="outline"
													size="xs"
													onClick={() => setPreviewFile(file)}
												>
													<Eye className="size-3.5" aria-hidden="true" />
													<span>Preview</span>
												</Button>
												<Button
													type="button"
													variant="ghost"
													size="icon-xs"
													aria-label={`Download ${file.name}`}
													onClick={() => void handleDownload(file.id)}
												>
													<Download className="size-3.5" aria-hidden="true" />
												</Button>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>

					{/* Pagination Footer */}
					<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-muted-foreground">
						<span className="font-mono tabular-nums">
							Page {pagination.page} of {pagination.totalPages} ·{' '}
							{pagination.total}{' '}
							{pagination.total === 1 ? 'result' : 'results'}
						</span>
						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="outline"
								size="xs"
								disabled={pagination.page <= 1}
								onClick={() => setPage(pagination.page - 1)}
							>
								<ChevronLeft className="size-3.5" aria-hidden="true" />
								<span>Previous</span>
							</Button>
							<Button
								type="button"
								variant="outline"
								size="xs"
								disabled={pagination.page >= pagination.totalPages}
								onClick={() => setPage(pagination.page + 1)}
							>
								<span>Next</span>
								<ChevronRight className="size-3.5" aria-hidden="true" />
							</Button>
						</div>
					</div>
				</>
			)}

			<FilePreviewModal
				file={previewFile}
				files={items}
				tenantId={tenantId}
				onClose={() => setPreviewFile(null)}
				onSelectFile={setPreviewFile}
			/>
		</div>
	);
}
