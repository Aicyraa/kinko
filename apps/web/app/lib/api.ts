import type { AppType } from 'api/app';
import { hc } from 'hono/client';

export const api = hc<AppType>('/', {
	init: {
		credentials: 'include',
	},
});

export interface ApiEnvelope<T = unknown> {
	success: boolean;
	message: string;
	code: number;
	payload?: T;
	error?: {
		issues?: Array<{ path: string; message: string }>;
		reason?: string;
	};
}

export class ApiError extends Error {
	code: number;
	issues?: Array<{ path: string; message: string }>;

	constructor(
		message: string,
		code: number,
		issues?: Array<{ path: string; message: string }>,
	) {
		super(message);
		this.name = 'ApiError';
		this.code = code;
		this.issues = issues;
	}
}

export async function parseApiResponse<T>(res: Response): Promise<T> {
	const data = (await res.json()) as ApiEnvelope<T>;
	if (!res.ok || !data.success) {
		const firstIssue = data.error?.issues?.[0]?.message;
		throw new ApiError(
			firstIssue ?? data.message ?? 'Request failed',
			data.code ?? res.status,
			data.error?.issues,
		);
	}
	return data.payload as T;
}

const ACTIVE_TENANT_STORAGE_KEY = 'kinko:active-tenant-id';

export function getStoredTenantId(): string | null {
	if (typeof window === 'undefined') return null;
	return window.localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY);
}

export function setStoredTenantId(tenantId: string | null): void {
	if (typeof window === 'undefined') return;
	if (!tenantId) {
		window.localStorage.removeItem(ACTIVE_TENANT_STORAGE_KEY);
		return;
	}
	window.localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, tenantId);
}

export function tenantHeaders(
	tenantId?: string | null,
): Record<string, string> {
	if (!tenantId) return {};
	return { 'X-Tenant-Id': tenantId };
}

export interface FolderItem {
	id: string;
	tenantId: string;
	parentFolderId: string | null;
	name: string;
	createdById: string;
	createdAt: string;
	updatedAt: string;
	deletedAt: string | null;
}

export interface FileItem {
	id: string;
	tenantId: string;
	folderId: string | null;
	uploadedById: string;
	name: string;
	mimeType: string;
	sizeBytes: number;
	checksumSha256: string | null;
	currentVersion: number;
	createdAt: string;
	updatedAt: string;
	deletedAt: string | null;
}

export interface BreadcrumbItem {
	id: string;
	name: string;
}

export interface FolderDetailsPayload {
	folder: FolderItem;
	breadcrumbs: BreadcrumbItem[];
	children: FolderItem[];
	files: FileItem[];
}

export interface FilesListPayload {
	items: FileItem[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
}

export interface UploadIntentPayload {
	upload: {
		id: string;
		tenantId: string;
		folderId: string | null;
		fileName: string;
		mimeType: string;
		declaredSizeBytes: number;
		status: string;
	};
	uploadUrl: string;
	expiresInSeconds: number;
	requiredHeaders: Record<string, string>;
}

export interface UploadCompletePayload {
	file: FileItem;
	isDuplicate: boolean;
	duplicateOf: FileItem[];
}

export interface FavoriteItem {
	id: string;
	targetType: 'FILE' | 'FOLDER';
	fileId: string | null;
	folderId: string | null;
	createdAt: string;
	file: FileItem | null;
	folder: FolderItem | null;
}

export interface FavoritesPayload {
	items: FavoriteItem[];
	fileIds: string[];
	folderIds: string[];
}

export interface FileShareItem {
	id: string;
	fileId: string;
	hasPassword: boolean;
	expiresAt: string | null;
	revokedAt: string | null;
	downloadCount: number;
	status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
	createdAt: string;
}

export interface FilePermissionItem {
	id: string;
	tenantId: string;
	fileId: string;
	userId: string;
	role: 'VIEWER' | 'EDITOR' | 'OWNER';
	grantedById: string | null;
	userName: string | null;
	userEmail: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface TenantMemberItem {
	id: string;
	tenantId: string;
	userId: string;
	role: 'OWNER' | 'ADMIN' | 'MEMBER';
	name: string | null;
	email: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface FileVersionItem {
	id: string;
	tenantId: string;
	fileId: string;
	versionNumber: number;
	mimeType: string;
	sizeBytes: number;
	checksumSha256: string | null;
	uploadedById: string;
	createdAt: string;
}

export interface DuplicateGroupItem {
	checksumSha256: string;
	count: number;
	totalSizeBytes: number;
	wastedBytes: number;
	files: FileItem[];
}

export interface DuplicatesPayload {
	groups: DuplicateGroupItem[];
	totalDuplicateFiles: number;
	totalWastedBytes: number;
}

export interface ActivityLogItem {
	id: string;
	tenantId: string;
	actorId: string | null;
	actorName: string | null;
	actorEmail: string | null;
	action: string;
	targetType: string;
	fileId: string | null;
	folderId: string | null;
	targetName: string | null;
	metadata: Record<string, unknown> | null;
	createdAt: string;
}

export function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.min(
		Math.floor(Math.log(bytes) / Math.log(1024)),
		units.length - 1,
	);
	const value = bytes / 1024 ** i;
	return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)} ${units[i]}`;
}

export function formatDate(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '—';
	return new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	}).format(date);
}
