import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	type ActivityLogItem,
	ApiError,
	api,
	type DuplicatesPayload,
	type FavoritesPayload,
	type FileItem,
	type FilePermissionItem,
	type FileShareItem,
	type FileVersionItem,
	parseApiResponse,
	type TenantMemberItem,
	tenantHeaders,
} from '../lib/api';
import { AUTH_QUERY_KEY } from './use-auth';

export function useFavorites(tenantId: string | null | undefined) {
	return useQuery({
		queryKey: ['vault', 'favorites', tenantId ?? 'none'],
		enabled: Boolean(tenantId),
		queryFn: async (): Promise<FavoritesPayload> => {
			const res = await api.api.v1.favorites.$get(
				{},
				{ headers: tenantHeaders(tenantId) },
			);
			return parseApiResponse<FavoritesPayload>(res);
		},
	});
}

export function useToggleFavorite(tenantId: string | null | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: {
			targetType: 'FILE' | 'FOLDER';
			targetId: string;
			isFavorite: boolean;
		}) => {
			const headers = tenantHeaders(tenantId);
			if (input.isFavorite) {
				const res = await api.api.v1.favorites[':targetType'][
					':targetId'
				].$delete(
					{
						param: {
							targetType: input.targetType,
							targetId: input.targetId,
						},
					},
					{ headers },
				);
				return parseApiResponse(res);
			}
			const res = await api.api.v1.favorites.$post(
				{
					json: {
						targetType: input.targetType,
						targetId: input.targetId,
					},
				},
				{ headers },
			);
			return parseApiResponse(res);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: ['vault', 'favorites', tenantId ?? 'none'],
			});
		},
	});
}

export function useDuplicates(tenantId: string | null | undefined) {
	return useQuery({
		queryKey: ['vault', 'duplicates', tenantId ?? 'none'],
		enabled: Boolean(tenantId),
		queryFn: async (): Promise<DuplicatesPayload> => {
			const res = await api.api.v1.files.duplicates.$get(
				{},
				{ headers: tenantHeaders(tenantId) },
			);
			return parseApiResponse<DuplicatesPayload>(res);
		},
	});
}

export function useFileShares(
	tenantId: string | null | undefined,
	fileId: string | null,
) {
	return useQuery({
		queryKey: ['vault', 'shares', tenantId ?? 'none', fileId ?? 'none'],
		enabled: Boolean(tenantId && fileId),
		queryFn: async (): Promise<{ shares: FileShareItem[] }> => {
			const res = await api.api.v1.shares.file[':fileId'].$get(
				{ param: { fileId: fileId as string } },
				{ headers: tenantHeaders(tenantId) },
			);
			return parseApiResponse<{ shares: FileShareItem[] }>(res);
		},
	});
}

export function useCreateShare(tenantId: string | null | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: {
			fileId: string;
			password?: string;
			expiresInHours?: number | null;
		}) => {
			const res = await api.api.v1.shares.$post(
				{ json: input },
				{ headers: tenantHeaders(tenantId) },
			);
			return parseApiResponse<{
				share: FileShareItem;
				token: string;
				sharePath: string;
			}>(res);
		},
		onSuccess: async (_, vars) => {
			await queryClient.invalidateQueries({
				queryKey: ['vault', 'shares', tenantId ?? 'none', vars.fileId],
			});
		},
	});
}

export function useRevokeShare(
	tenantId: string | null | undefined,
	fileId: string | null,
) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (shareId: string) => {
			const res = await api.api.v1.shares[':shareId'].$delete(
				{ param: { shareId } },
				{ headers: tenantHeaders(tenantId) },
			);
			return parseApiResponse<{ share: FileShareItem }>(res);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: ['vault', 'shares', tenantId ?? 'none', fileId ?? 'none'],
			});
		},
	});
}

export function useFilePermissions(
	tenantId: string | null | undefined,
	fileId: string | null,
) {
	return useQuery({
		queryKey: ['vault', 'permissions', tenantId ?? 'none', fileId ?? 'none'],
		enabled: Boolean(tenantId && fileId),
		queryFn: async (): Promise<{
			fileId: string;
			effectiveRole: 'VIEWER' | 'EDITOR' | 'OWNER';
			permissions: FilePermissionItem[];
		}> => {
			const res = await api.api.v1.permissions.file[':fileId'].$get(
				{ param: { fileId: fileId as string } },
				{ headers: tenantHeaders(tenantId) },
			);
			return parseApiResponse(res);
		},
	});
}

export function useTenantMembers(tenantId: string | null | undefined) {
	return useQuery({
		queryKey: ['vault', 'members', tenantId ?? 'none'],
		enabled: Boolean(tenantId),
		queryFn: async (): Promise<{ members: TenantMemberItem[] }> => {
			const res = await api.api.v1.tenants[':tenantId'].members.$get({
				param: { tenantId: tenantId as string },
			});
			return parseApiResponse<{ members: TenantMemberItem[] }>(res);
		},
	});
}

export function useUpsertFilePermission(
	tenantId: string | null | undefined,
	fileId: string | null,
) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: {
			userId: string;
			role: 'VIEWER' | 'EDITOR' | 'OWNER';
		}) => {
			const res = await api.api.v1.permissions.file[':fileId'].$put(
				{
					param: { fileId: fileId as string },
					json: input,
				},
				{ headers: tenantHeaders(tenantId) },
			);
			return parseApiResponse<{ permission: FilePermissionItem }>(res);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: ['vault', 'permissions', tenantId ?? 'none', fileId ?? 'none'],
			});
		},
	});
}

export function useRemoveFilePermission(
	tenantId: string | null | undefined,
	fileId: string | null,
) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (userId: string) => {
			const res = await api.api.v1.permissions.file[':fileId'][
				':userId'
			].$delete(
				{ param: { fileId: fileId as string, userId } },
				{ headers: tenantHeaders(tenantId) },
			);
			return parseApiResponse(res);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: ['vault', 'permissions', tenantId ?? 'none', fileId ?? 'none'],
			});
		},
	});
}

export function useFileVersions(
	tenantId: string | null | undefined,
	fileId: string | null,
) {
	return useQuery({
		queryKey: ['vault', 'versions', tenantId ?? 'none', fileId ?? 'none'],
		enabled: Boolean(tenantId && fileId),
		queryFn: async (): Promise<{
			file: FileItem;
			versions: FileVersionItem[];
		}> => {
			const res = await api.api.v1.files[':fileId'].versions.$get(
				{ param: { fileId: fileId as string } },
				{ headers: tenantHeaders(tenantId) },
			);
			return parseApiResponse(res);
		},
	});
}

export function useDownloadFileVersion(tenantId: string | null | undefined) {
	return useMutation({
		mutationFn: async (input: {
			fileId: string;
			versionId: string;
			fileName: string;
			versionNumber: number;
		}) => {
			const res = await api.api.v1.files[':fileId'].versions[
				':versionId'
			].download.$get(
				{
					param: { fileId: input.fileId, versionId: input.versionId },
				},
				{ headers: tenantHeaders(tenantId) },
			);
			const payload = await parseApiResponse<{ downloadUrl: string }>(res);
			const link = document.createElement('a');
			link.href = payload.downloadUrl;
			link.download = `v${input.versionNumber}-${input.fileName}`;
			link.rel = 'noopener noreferrer';
			document.body.appendChild(link);
			link.click();
			link.remove();
			return payload;
		},
	});
}

export function useRestoreFileVersion(
	tenantId: string | null | undefined,
	fileId: string | null,
) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (versionId: string) => {
			const res = await api.api.v1.files[':fileId'].versions[
				':versionId'
			].restore.$post(
				{ param: { fileId: fileId as string, versionId } },
				{ headers: tenantHeaders(tenantId) },
			);
			return parseApiResponse<{ file: FileItem; version: FileVersionItem }>(res);
		},
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ['vault'] }),
				queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY }),
			]);
		},
	});
}

export function useDownloadZip(tenantId: string | null | undefined) {
	return useMutation({
		mutationFn: async (input: {
			fileIds: string[];
			folderIds: string[];
			archiveName?: string;
		}) => {
			const res = await fetch('/api/v1/downloads/zip', {
				method: 'POST',
				credentials: 'include',
				headers: {
					'Content-Type': 'application/json',
					...tenantHeaders(tenantId),
				},
				body: JSON.stringify(input),
			});

			if (!res.ok) {
				let message = 'Failed to generate ZIP archive';
				try {
					const errJson = (await res.json()) as { message?: string };
					if (errJson.message) message = errJson.message;
				} catch {
					// ignore non-json
				}
				throw new ApiError(message, res.status);
			}

			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const filename = `${(input.archiveName ?? 'kinko-vault-archive').replace(/\.zip$/i, '')}.zip`;
			const link = document.createElement('a');
			link.href = url;
			link.download = filename;
			document.body.appendChild(link);
			link.click();
			link.remove();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			return filename;
		},
	});
}

export type ActivityActionFilter =
	| 'ALL'
	| 'FILE_UPLOADED'
	| 'FILE_DOWNLOADED'
	| 'FILE_RENAMED'
	| 'FILE_MOVED'
	| 'FILE_DELETED'
	| 'FILE_RESTORED'
	| 'FILE_PERMANENTLY_DELETED'
	| 'FILE_SHARED'
	| 'FILE_SHARE_REVOKED'
	| 'FILE_PERMISSION_UPDATED'
	| 'FILE_VERSION_CREATED'
	| 'FOLDER_CREATED'
	| 'FOLDER_RENAMED'
	| 'FOLDER_MOVED'
	| 'FOLDER_DELETED'
	| 'FOLDER_RESTORED'
	| 'FOLDER_PERMANENTLY_DELETED'
	| 'MEMBER_ADDED'
	| 'MEMBER_ROLE_UPDATED'
	| 'MEMBER_REMOVED';

export function useAuditActivities(
	tenantId: string | null | undefined,
	options: { page: number; limit: number; action?: ActivityActionFilter },
) {
	return useQuery({
		queryKey: [
			'vault',
			'audit-activities',
			tenantId ?? 'none',
			options.page,
			options.limit,
			options.action ?? 'ALL',
		],
		enabled: Boolean(tenantId),
		queryFn: async (): Promise<{
			items: ActivityLogItem[];
			pagination: {
				page: number;
				limit: number;
				total: number;
				totalPages: number;
			};
		}> => {
			const res = await api.api.v1.activities.$get(
				{
					query: {
						page: String(options.page),
						limit: String(options.limit),
						...(options.action && options.action !== 'ALL'
							? { action: options.action }
							: {}),
					},
				},
				{ headers: tenantHeaders(tenantId) },
			);
			return parseApiResponse(res);
		},
	});
}
