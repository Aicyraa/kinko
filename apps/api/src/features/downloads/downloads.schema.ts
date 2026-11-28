import { z } from 'zod';

export const ZipDownloadSchema = z
	.object({
		fileIds: z.array(z.string().uuid('Invalid file ID')).max(200).default([]),
		folderIds: z.array(z.string().uuid('Invalid folder ID')).max(50).default([]),
		archiveName: z.string().trim().min(1).max(120).optional(),
	})
	.refine(
		(data) => data.fileIds.length + data.folderIds.length > 0,
		'Select at least one file or folder to download',
	);
