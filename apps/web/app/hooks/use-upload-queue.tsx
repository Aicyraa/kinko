import { useQueryClient } from '@tanstack/react-query';
import {
	createContext,
	type ReactNode,
	use,
	useCallback,
	useRef,
	useState,
} from 'react';
import { toast } from 'sonner';
import {
	ApiError,
	api,
	parseApiResponse,
	tenantHeaders,
	type UploadCompletePayload,
	type UploadIntentPayload,
} from '../lib/api';
import { AUTH_QUERY_KEY } from './use-auth';

export type UploadTaskStatus =
	| 'queued'
	| 'uploading'
	| 'verifying'
	| 'completed'
	| 'error'
	| 'cancelled';

export interface UploadTask {
	id: string;
	file: File;
	fileName: string;
	sizeBytes: number;
	folderId: string | null;
	targetFileId?: string | null;
	multipartUploadId?: string | null;
	tenantId: string;
	status: UploadTaskStatus;
	progress: number;
	errorMessage: string | null;
}

interface UploadQueueContextValue {
	tasks: UploadTask[];
	enqueueFiles: (
		files: File[],
		options: { tenantId: string; folderId: string | null },
	) => void;
	enqueueVersionUpload: (
		file: File,
		options: { tenantId: string; fileId: string },
	) => void;
	retryTask: (taskId: string) => void;
	cancelTask: (taskId: string) => void;
	dismissTask: (taskId: string) => void;
	clearCompleted: () => void;
}

const UploadQueueContext = createContext<UploadQueueContextValue | null>(null);

const MULTIPART_THRESHOLD_BYTES = 5 * 1024 * 1024;
const MULTIPART_PART_SIZE_BYTES = 5 * 1024 * 1024;

async function computeSha256Hex(file: File): Promise<string | undefined> {
	if (typeof crypto === 'undefined' || !crypto.subtle) return undefined;
	if (file.size > 50 * 1024 * 1024) return undefined;
	try {
		const buffer = await file.arrayBuffer();
		const digest = await crypto.subtle.digest('SHA-256', buffer);
		return Array.from(new Uint8Array(digest))
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');
	} catch {
		return undefined;
	}
}

function uploadBlobWithXhr(
	url: string,
	body: Blob,
	headers: Record<string, string>,
	onProgress: (loadedBytes: number) => void,
	registerXhr: (xhr: XMLHttpRequest) => void,
): Promise<{ eTag: string | null }> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		registerXhr(xhr);
		xhr.open('PUT', url);

		for (const [key, value] of Object.entries(headers)) {
			if (key.toLowerCase() !== 'content-length') {
				xhr.setRequestHeader(key, value);
			}
		}

		xhr.upload.onprogress = (event) => {
			if (event.lengthComputable) {
				onProgress(event.loaded);
			}
		};

		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				onProgress(body.size);
				resolve({ eTag: xhr.getResponseHeader('ETag') });
			} else {
				reject(new Error(`Storage upload failed (${xhr.status})`));
			}
		};

		xhr.onerror = () => reject(new Error('Network error during file upload'));
		xhr.onabort = () => reject(new Error('Upload cancelled'));
		xhr.send(body);
	});
}

export function UploadQueueProvider({ children }: { children: ReactNode }) {
	const [tasks, setTasks] = useState<UploadTask[]>([]);
	const xhrMapRef = useRef<Map<string, XMLHttpRequest>>(new Map());
	const queryClient = useQueryClient();

	const updateTask = useCallback(
		(id: string, patch: Partial<UploadTask>) => {
			setTasks((prev) =>
				prev.map((task) => (task.id === id ? { ...task, ...patch } : task)),
			);
		},
		[],
	);

	const runMultipartUpload = useCallback(
		async (task: UploadTask, mimeType: string) => {
			const headers = tenantHeaders(task.tenantId);
			let uploadId = task.multipartUploadId ?? null;
			let partSizeBytes = MULTIPART_PART_SIZE_BYTES;
			let remainingPartNumbers: number[] = [];
			let completedBytes = 0;

			if (uploadId) {
				const stateRes = await api.api.v1.uploads.multipart[':uploadId'].$get(
					{ param: { uploadId } },
					{ headers },
				);
				const state = await parseApiResponse<{
					upload: {
						status: string;
						partSizeBytes: number | null;
						totalParts: number | null;
					};
					completedParts: Array<{ partNumber: number; sizeBytes: number }>;
					remainingPartNumbers: number[];
				}>(stateRes);

				if (state.upload.status === 'IN_PROGRESS') {
					partSizeBytes = state.upload.partSizeBytes ?? MULTIPART_PART_SIZE_BYTES;
					remainingPartNumbers = state.remainingPartNumbers;
					completedBytes = state.completedParts.reduce(
						(sum, p) => sum + p.sizeBytes,
						0,
					);
				} else {
					uploadId = null;
				}
			}

			if (!uploadId) {
				const initRes = await api.api.v1.uploads.multipart.$post(
					{
						json: {
							fileName: task.fileName,
							mimeType,
							sizeBytes: task.sizeBytes,
							folderId: task.folderId,
							fileId: task.targetFileId ?? null,
							partSizeBytes,
						},
					},
					{ headers },
				);
				const init = await parseApiResponse<{
					upload: { id: string };
					partSizeBytes: number;
					totalParts: number;
				}>(initRes);
				uploadId = init.upload.id;
				partSizeBytes = init.partSizeBytes;
				remainingPartNumbers = Array.from(
					{ length: init.totalParts },
					(_, i) => i + 1,
				);
				updateTask(task.id, { multipartUploadId: uploadId });
			}

			for (const partNumber of remainingPartNumbers) {
				const start = (partNumber - 1) * partSizeBytes;
				const end = Math.min(task.sizeBytes, start + partSizeBytes);
				const chunk = task.file.slice(start, end);

				const urlRes = await api.api.v1.uploads.multipart[':uploadId'].parts[
					':partNumber'
				].url.$post(
					{
						param: { uploadId, partNumber: String(partNumber) },
					},
					{ headers },
				);
				const { uploadUrl } = await parseApiResponse<{ uploadUrl: string }>(
					urlRes,
				);

				const { eTag } = await uploadBlobWithXhr(
					uploadUrl,
					chunk,
					{},
					(loaded) => {
						const pct = Math.min(
							99,
							Math.round(((completedBytes + loaded) / task.sizeBytes) * 100),
						);
						updateTask(task.id, { progress: pct });
					},
					(xhr) => xhrMapRef.current.set(task.id, xhr),
				);

				if (!eTag) {
					throw new Error('Storage did not expose part ETag header');
				}

				const recordRes = await api.api.v1.uploads.multipart[':uploadId'].parts[
					':partNumber'
				].$post(
					{
						param: { uploadId, partNumber: String(partNumber) },
						json: { eTag, sizeBytes: chunk.size },
					},
					{ headers },
				);
				await parseApiResponse(recordRes);
				completedBytes += chunk.size;
			}

			xhrMapRef.current.delete(task.id);
			updateTask(task.id, { status: 'verifying', progress: 100 });

			const checksumSha256 = await computeSha256Hex(task.file);
			const completeRes = await api.api.v1.uploads.multipart[
				':uploadId'
			].complete.$post(
				{
					param: { uploadId },
					json: checksumSha256 ? { checksumSha256 } : {},
				},
				{ headers },
			);
			return parseApiResponse<UploadCompletePayload>(completeRes);
		},
		[updateTask],
	);

	const runUpload = useCallback(
		async (task: UploadTask) => {
			const headers = tenantHeaders(task.tenantId);
			updateTask(task.id, {
				status: 'uploading',
				progress: 0,
				errorMessage: null,
			});

			try {
				const mimeType = task.file.type || 'application/octet-stream';
				let completed: UploadCompletePayload;

				if (task.sizeBytes > MULTIPART_THRESHOLD_BYTES) {
					completed = await runMultipartUpload(task, mimeType);
				} else {
					const [checksumSha256, intentRes] = await Promise.all([
						computeSha256Hex(task.file),
						task.targetFileId
							? api.api.v1.files[':fileId'].versions.$post(
									{
										param: { fileId: task.targetFileId },
										json: { mimeType, sizeBytes: task.sizeBytes },
									},
									{ headers },
								)
							: api.api.v1.uploads.$post(
									{
										json: {
											fileName: task.fileName,
											mimeType,
											sizeBytes: task.sizeBytes,
											folderId: task.folderId,
										},
									},
									{ headers },
								),
					]);

					const intent = await parseApiResponse<UploadIntentPayload>(intentRes);

					await uploadBlobWithXhr(
						intent.uploadUrl,
						task.file,
						intent.requiredHeaders,
						(loaded) =>
							updateTask(task.id, {
								progress:
									task.sizeBytes > 0
										? Math.round((loaded / task.sizeBytes) * 100)
										: 100,
							}),
						(xhr) => xhrMapRef.current.set(task.id, xhr),
					);

					xhrMapRef.current.delete(task.id);
					updateTask(task.id, { status: 'verifying', progress: 100 });

					const completeRes = await api.api.v1.uploads[
						':uploadId'
					].complete.$post(
						{
							param: { uploadId: intent.upload.id },
							json: checksumSha256 ? { checksumSha256 } : {},
						},
						{ headers },
					);
					completed = await parseApiResponse<UploadCompletePayload>(completeRes);
				}

				updateTask(task.id, { status: 'completed', progress: 100 });
				if (completed.isDuplicate) {
					toast.info(
						`"${completed.file.name}" matches ${completed.duplicateOf.length} existing duplicate(s) in this vault.`,
					);
				}
				await Promise.all([
					queryClient.invalidateQueries({ queryKey: ['vault'] }),
					queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY }),
				]);
			} catch (err) {
				xhrMapRef.current.delete(task.id);
				const message =
					err instanceof ApiError
						? err.message
						: err instanceof Error
							? err.message
							: 'Upload failed';

				setTasks((prev) =>
					prev.map((item) => {
						if (item.id !== task.id) return item;
						if (item.status === 'cancelled') return item;
						return {
							...item,
							status: message === 'Upload cancelled' ? 'cancelled' : 'error',
							errorMessage: message === 'Upload cancelled' ? null : message,
						};
					}),
				);
			}
		},
		[queryClient, runMultipartUpload, updateTask],
	);

	const enqueueFiles = useCallback(
		(
			files: File[],
			options: { tenantId: string; folderId: string | null },
		) => {
			if (files.length === 0) return;

			const newTasks: UploadTask[] = files.map((file) => ({
				id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
				file,
				fileName: file.name,
				sizeBytes: file.size,
				folderId: options.folderId,
				targetFileId: null,
				multipartUploadId: null,
				tenantId: options.tenantId,
				status: 'queued',
				progress: 0,
				errorMessage: null,
			}));

			setTasks((prev) => [...newTasks, ...prev]);

			for (const task of newTasks) {
				void runUpload(task);
			}
		},
		[runUpload],
	);

	const enqueueVersionUpload = useCallback(
		(file: File, options: { tenantId: string; fileId: string }) => {
			const task: UploadTask = {
				id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
				file,
				fileName: file.name,
				sizeBytes: file.size,
				folderId: null,
				targetFileId: options.fileId,
				multipartUploadId: null,
				tenantId: options.tenantId,
				status: 'queued',
				progress: 0,
				errorMessage: null,
			};
			setTasks((prev) => [task, ...prev]);
			void runUpload(task);
		},
		[runUpload],
	);

	const retryTask = useCallback(
		(taskId: string) => {
			const target = tasks.find((t) => t.id === taskId);
			if (!target) return;
			void runUpload(target);
		},
		[runUpload, tasks],
	);

	const cancelTask = useCallback((taskId: string) => {
		const xhr = xhrMapRef.current.get(taskId);
		if (xhr) {
			xhr.abort();
			xhrMapRef.current.delete(taskId);
		}
		setTasks((prev) =>
			prev.map((t) =>
				t.id === taskId ? { ...t, status: 'cancelled', errorMessage: null } : t,
			),
		);
	}, []);

	const dismissTask = useCallback((taskId: string) => {
		setTasks((prev) => prev.filter((t) => t.id !== taskId));
	}, []);

	const clearCompleted = useCallback(() => {
		setTasks((prev) =>
			prev.filter(
				(t) => t.status !== 'completed' && t.status !== 'cancelled',
			),
		);
	}, []);

	return (
		<UploadQueueContext
			value={{
				tasks,
				enqueueFiles,
				enqueueVersionUpload,
				retryTask,
				cancelTask,
				dismissTask,
				clearCompleted,
			}}
		>
			{children}
		</UploadQueueContext>
	);
}

export function useUploadQueue(): UploadQueueContextValue {
	const ctx = use(UploadQueueContext);
	if (!ctx) {
		throw new Error('useUploadQueue must be used within UploadQueueProvider');
	}
	return ctx;
}
