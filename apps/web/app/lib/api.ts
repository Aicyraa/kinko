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
