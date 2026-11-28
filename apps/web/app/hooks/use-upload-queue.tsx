import { useQueryClient } from '@tanstack/react-query';
import {
	createContext,
	type ReactNode,
	use,
	useCallback,
	useRef,
	useState,
} from 'react';
import {
	ApiError,
	api,
	parseApiResponse,
	tenantHeaders,
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
	retryTask: (taskId: string) => void;
	cancelTask: (taskId: string) => void;
	dismissTask: (taskId: string) => void;
	clearCompleted: () => void;
}

const UploadQueueContext = createContext<UploadQueueContextValue | null>(null);

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

function uploadWithXhr(
	url: string,
	file: File,
	headers: Record<string, string>,
	onProgress: (pct: number) => void,
	registerXhr: (xhr: XMLHttpRequest) => void,
): Promise<void> {
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
			if (event.lengthComputable && event.total > 0) {
				onProgress(Math.round((event.loaded / event.total) * 100));
			}
		};

		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				onProgress(100);
				resolve();
			} else {
				reject(new Error(`Storage upload failed (${xhr.status})`));
			}
		};

		xhr.onerror = () => reject(new Error('Network error during file upload'));
		xhr.onabort = () => reject(new Error('Upload cancelled'));
		xhr.send(file);
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
				const [checksumSha256, intentRes] = await Promise.all([
					computeSha256Hex(task.file),
					api.api.v1.uploads.$post(
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

				await uploadWithXhr(
					intent.uploadUrl,
					task.file,
					intent.requiredHeaders,
					(progress) => updateTask(task.id, { progress }),
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
				await parseApiResponse(completeRes);

				updateTask(task.id, { status: 'completed', progress: 100 });
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
		[queryClient, updateTask],
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
