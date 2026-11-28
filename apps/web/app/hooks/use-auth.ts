import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	api,
	getStoredTenantId,
	parseApiResponse,
	setStoredTenantId,
} from '../lib/api';

export interface SessionUser {
	id: string;
	email: string;
	name: string;
	image?: string | null;
}

export interface WorkspaceTenant {
	id: string;
	name: string;
	ownerId: string | null;
	storageQuotaBytes: number;
	role: 'OWNER' | 'ADMIN' | 'MEMBER';
	createdAt: string;
	updatedAt: string;
	analytics: {
		storageUsedBytes: number;
		totalFiles: number;
		totalFolders: number;
		totalUploads: number;
		totalDownloads: number;
	} | null;
}

export interface SessionPayload {
	user: SessionUser;
	profile: {
		id: string;
		onboardingComplete: boolean;
		defaultTenantId: string | null;
	};
	defaultTenantId: string | null;
	tenants: WorkspaceTenant[];
}

export const AUTH_QUERY_KEY = ['auth', 'session'] as const;
export const TENANTS_QUERY_KEY = ['tenants'] as const;

export function useSession() {
	return useQuery({
		queryKey: AUTH_QUERY_KEY,
		queryFn: async (): Promise<SessionPayload | null> => {
			const res = await api.api.v1.auth.me.$get();
			if (res.status === 401) {
				return null;
			}
			const payload = await parseApiResponse<SessionPayload>(res);
			const stored = getStoredTenantId();
			const hasStored = stored && payload.tenants.some((t) => t.id === stored);
			if (!hasStored && payload.defaultTenantId) {
				setStoredTenantId(payload.defaultTenantId);
			}
			return payload;
		},
		retry: false,
		staleTime: 30_000,
	});
}

export function useSignIn() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: { email: string; password: string }) => {
			const res = await api.api.v1.auth.signin.$post({ json: input });
			return parseApiResponse<SessionPayload>(res);
		},
		onSuccess: (payload) => {
			if (payload.defaultTenantId) {
				setStoredTenantId(payload.defaultTenantId);
			}
			queryClient.setQueryData(AUTH_QUERY_KEY, payload);
		},
	});
}

export function useSignUp() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: {
			name: string;
			email: string;
			password: string;
			passwordConfirm: string;
		}) => {
			const res = await api.api.v1.auth.signup.$post({ json: input });
			return parseApiResponse<SessionPayload>(res);
		},
		onSuccess: (payload) => {
			if (payload.defaultTenantId) {
				setStoredTenantId(payload.defaultTenantId);
			}
			queryClient.setQueryData(AUTH_QUERY_KEY, payload);
		},
	});
}

export function useSignOut() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async () => {
			const res = await api.api.v1.auth.signout.$post();
			return parseApiResponse<Record<string, never>>(res);
		},
		onSuccess: () => {
			setStoredTenantId(null);
			queryClient.setQueryData(AUTH_QUERY_KEY, null);
			queryClient.removeQueries({ queryKey: TENANTS_QUERY_KEY });
		},
	});
}

export function useCreateTenant() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: { name: string }) => {
			const res = await api.api.v1.tenants.$post({ json: input });
			return parseApiResponse<{ tenant: WorkspaceTenant }>(res);
		},
		onSuccess: async ({ tenant }) => {
			setStoredTenantId(tenant.id);
			await queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
		},
	});
}

export function useSetDefaultTenant() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (tenantId: string) => {
			const res = await api.api.v1.tenants[':tenantId'].default.$post({
				param: { tenantId },
			});
			return parseApiResponse<{ profile: SessionPayload['profile'] }>(res);
		},
		onSuccess: async (_, tenantId) => {
			setStoredTenantId(tenantId);
			await queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
		},
	});
}
