import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	api,
	type BreadcrumbItem,
	type FileItem,
	type FilesListPayload,
	type FolderDetailsPayload,
	type FolderItem,
	parseApiResponse,
	tenantHeaders,
} from '../lib/api';
import { AUTH_QUERY_KEY } from './use-auth';

export type SortField = 'name' | 'sizeBytes' | 'updatedAt';
export type SortOrder = 'asc' | 'desc';

export interface FolderListingData {
	folder: FolderItem | null;
	breadcrumbs: BreadcrumbItem[];
	folders: FolderItem[];
	files: FileItem[];
}

function sortFolders(
	folders: FolderItem[],
	sortBy: SortField,
	sortOrder: SortOrder,
): FolderItem[] {
	const dir = sortOrder === 'asc' ? 1 : -1;
	const field = sortBy === 'sizeBytes' ? 'name' : sortBy;
	return [...folders].sort((a, b) => {
		if (field === 'name') {
			return a.name.localeCompare(b.name) * dir;
		}
		return a.updatedAt.localeCompare(b.updatedAt) * dir;
	});
}

function sortFiles(
	files: FileItem[],
	sortBy: SortField,
	sortOrder: SortOrder,
): FileItem[] {
	const dir = sortOrder === 'asc' ? 1 : -1;
	return [...files].sort((a, b) => {
		if (sortBy === 'name') return a.name.localeCompare(b.name) * dir;
		if (sortBy === 'sizeBytes') return (a.sizeBytes - b.sizeBytes) * dir;
		return a.updatedAt.localeCompare(b.updatedAt) * dir;
	});
}

export function folderListingKey(
	tenantId: string | null | undefined,
	folderId: string | null,
	sortBy: SortField,
	sortOrder: SortOrder,
) {
	return ['vault', 'listing', tenantId ?? 'none', folderId ?? 'root', sortBy, sortOrder] as const;
}

export function useFolderListing(
	tenantId: string | null | undefined,
	folderId: string | null,
	sortBy: SortField,
	sortOrder: SortOrder,
) {
	return useQuery({
		queryKey: folderListingKey(tenantId, folderId, sortBy, sortOrder),
		enabled: Boolean(tenantId),
		queryFn: async (): Promise<FolderListingData> => {
			const headers = tenantHeaders(tenantId);

			if (!folderId) {
				const folderSortBy = sortBy === 'sizeBytes' ? 'name' : sortBy;
				const [foldersRes, filesRes] = await Promise.all([
					api.api.v1.folders.$get(
						{
							query: {
								parentFolderId: 'root',
								sortBy: folderSortBy,
								sortOrder,
							},
						},
						{ headers },
					),
					api.api.v1.files.$get(
						{
							query: {
								folderId: 'root',
								sortBy,
								sortOrder,
								limit: '100',
							},
						},
						{ headers },
					),
				]);

				const [foldersPayload, filesPayload] = await Promise.all([
					parseApiResponse<{ folders: FolderItem[] }>(foldersRes),
					parseApiResponse<FilesListPayload>(filesRes),
				]);

				return {
					folder: null,
					breadcrumbs: [],
					folders: foldersPayload.folders,
					files: filesPayload.items,
				};
			}

			const res = await api.api.v1.folders[':folderId'].$get(
				{ param: { folderId } },
				{ headers },
			);
			const details = await parseApiResponse<FolderDetailsPayload>(res);
			return {
				folder: details.folder,
				breadcrumbs: details.breadcrumbs,
				folders: sortFolders(details.children, sortBy, sortOrder),
				files: sortFiles(details.files, sortBy, sortOrder),
			};
		},
	});
}

export function useAllFolders(tenantId: string | null | undefined) {
	return useQuery({
		queryKey: ['vault', 'all-folders', tenantId ?? 'none'],
		enabled: Boolean(tenantId),
		queryFn: async (): Promise<FolderItem[]> => {
			const res = await api.api.v1.folders.$get(
				{ query: { sortBy: 'name', sortOrder: 'asc' } },
				{ headers: tenantHeaders(tenantId) },
			);
			const payload = await parseApiResponse<{ folders: FolderItem[] }>(res);
			return payload.folders;
		},
	});
}

function useInvalidateVault() {
	const queryClient = useQueryClient();
	return async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: ['vault'] }),
			queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY }),
		]);
	};
}

export function useCreateFolder(tenantId: string | null | undefined) {
	const invalidate = useInvalidateVault();
	return useMutation({
		mutationFn: async (input: {
			name: string;
			parentFolderId: string | null;
		}) => {
			const res = await api.api.v1.folders.$post(
				{ json: input },
				{ headers: tenantHeaders(tenantId) },
			);
			return parseApiResponse<{ folder: FolderItem }>(res);
		},
		onSuccess: invalidate,
	});
}

export function useRenameFolder(tenantId: string | null | undefined) {
	const invalidate = useInvalidateVault();
	return useMutation({
		mutationFn: async (input: { folderId: string; name: string }) => {
			const res = await api.api.v1.folders[':folderId'].$patch(
				{ param: { folderId: input.folderId }, json: { name: input.name } },
				{ headers: tenantHeaders(tenantId) },
			);
			return parseApiResponse<{ folder: FolderItem }>(res);
		},
		onSuccess: invalidate,
	});
}

export function useMoveFolder(tenantId: string | null | undefined) {
	const invalidate = useInvalidateVault();
	return useMutation({
		mutationFn: async (input: {
			folderId: string;
			targetParentFolderId: string | null;
		}) => {
			const res = await api.api.v1.folders[':folderId'].move.$post(
				{
					param: { folderId: input.folderId },
					json: { targetParentFolderId: input.targetParentFolderId },
				},
				{ headers: tenantHeaders(tenantId) },
			);
			return parseApiResponse<{ folder: FolderItem }>(res);
		},
		onSuccess: invalidate,
	});
}

export function useDeleteFolder(tenantId: string | null | undefined) {
	const invalidate = useInvalidateVault();
	return useMutation({
		mutationFn: async (folderId: string) => {
			const res = await api.api.v1.folders[':folderId'].$delete(
				{ param: { folderId } },
				{ headers: tenantHeaders(tenantId) },
			);
			return parseApiResponse<{
				deletedFolderCount: number;
				deletedFileCount: number;
			}>(res);
		},
		onSuccess: invalidate,
	});
}

export function useRenameFile(tenantId: string | null | undefined) {
	const invalidate = useInvalidateVault();
	return useMutation({
		mutationFn: async (input: { fileId: string; name: string }) => {
			const res = await api.api.v1.files[':fileId'].$patch(
				{ param: { fileId: input.fileId }, json: { name: input.name } },
				{ headers: tenantHeaders(tenantId) },
			);
			return parseApiResponse<{ file: FileItem }>(res);
		},
		onSuccess: invalidate,
	});
}

export function useMoveFile(tenantId: string | null | undefined) {
	const invalidate = useInvalidateVault();
	return useMutation({
		mutationFn: async (input: {
			fileId: string;
			targetFolderId: string | null;
		}) => {
			const res = await api.api.v1.files[':fileId'].move.$post(
				{
					param: { fileId: input.fileId },
					json: { targetFolderId: input.targetFolderId },
				},
				{ headers: tenantHeaders(tenantId) },
			);
			return parseApiResponse<{ file: FileItem }>(res);
		},
		onSuccess: invalidate,
	});
}

export function useDeleteFile(tenantId: string | null | undefined) {
	const invalidate = useInvalidateVault();
	return useMutation({
		mutationFn: async (fileId: string) => {
			const res = await api.api.v1.files[':fileId'].$delete(
				{ param: { fileId } },
				{ headers: tenantHeaders(tenantId) },
			);
			return parseApiResponse<{ file: FileItem }>(res);
		},
		onSuccess: invalidate,
	});
}

export function useDownloadFile(tenantId: string | null | undefined) {
	return useMutation({
		mutationFn: async (fileId: string) => {
			const res = await api.api.v1.files[':fileId'].download.$get(
				{ param: { fileId }, query: { disposition: 'attachment' } },
				{ headers: tenantHeaders(tenantId) },
			);
			const payload = await parseApiResponse<{
				downloadUrl: string;
				file: FileItem;
			}>(res);
			const link = document.createElement('a');
			link.href = payload.downloadUrl;
			link.download = payload.file.name;
			link.rel = 'noopener noreferrer';
			document.body.appendChild(link);
			link.click();
			link.remove();
			return payload;
		},
	});
}
