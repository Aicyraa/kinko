import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, parseApiResponse, tenantHeaders } from '../lib/api';
import { AUTH_QUERY_KEY } from './use-auth';

export interface TrashItem {
	id: string;
	kind: 'file' | 'folder';
	tenantId: string;
	name: string;
	deletedAt: string;
	expiresAt: string;
	mimeType: string | null;
	sizeBytes: number | null;
	parentFolderId: string | null;
	folderId: string | null;
}

export interface TrashListPayload {
	items: TrashItem[];
	retentionDays: number;
}

export function trashListKey(tenantId: string | null | undefined) {
	return ['vault', 'trash', tenantId ?? 'none'] as const;
}

export function useTrashList(tenantId: string | null | undefined) {
	return useQuery({
		queryKey: trashListKey(tenantId),
		enabled: Boolean(tenantId),
		queryFn: async (): Promise<TrashListPayload> => {
			const res = await api.api.v1.trash.$get(undefined, {
				headers: tenantHeaders(tenantId),
			});
			return parseApiResponse<TrashListPayload>(res);
		},
	});
}

export function useRestoreTrashItem(tenantId: string | null | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: {
			itemId: string;
			kind: 'file' | 'folder';
		}) => {
			const res = await api.api.v1.trash[':itemId'].restore.$post(
				{ param: { itemId: input.itemId }, json: { kind: input.kind } },
				{ headers: tenantHeaders(tenantId) },
			);
			return parseApiResponse<{
				kind: 'file' | 'folder';
				id: string;
				name: string;
				restoredToRoot: boolean;
			}>(res);
		},
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ['vault'] }),
				queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY }),
			]);
		},
	});
}

export function usePermanentDeleteTrashItem(
	tenantId: string | null | undefined,
) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (itemId: string) => {
			const res = await api.api.v1.trash[':itemId'].$delete(
				{ param: { itemId } },
				{ headers: tenantHeaders(tenantId) },
			);
			return parseApiResponse<{
				deletedFolders: number;
				deletedFiles: number;
				freedBytes: number;
			}>(res);
		},
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ['vault'] }),
				queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY }),
			]);
		},
	});
}
