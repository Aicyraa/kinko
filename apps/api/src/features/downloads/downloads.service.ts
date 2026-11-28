import { PassThrough } from 'node:stream';
import { ZipArchive } from 'archiver';
import { HTTPException } from 'hono/http-exception';
import type { TenantMember } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.ts';
import { getStorageObjectBytes } from '../../lib/storage.ts';
import {
	assertFileAccess,
	resolveEffectiveFileRole,
} from '../permissions/permissions.service.ts';

const MAX_ARCHIVE_FILES = 200;
const MAX_ARCHIVE_BYTES = 250 * 1024 * 1024; // 250 MiB

function sanitizeSegment(name: string): string {
	return name
		.replace(/[\\/\0\r\n]+/g, '_')
		.replace(/\.\.+/g, '.')
		.trim() || 'item';
}

function sanitizeArchiveName(name?: string): string {
	const ascii = (name ?? 'kinko-vault-archive')
		.replace(/\.zip$/i, '')
		.replace(/[^a-zA-Z0-9._ -]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^[-\s]+|[-\s]+$/g, '');
	return `${ascii || 'kinko-vault-archive'}.zip`;
}

function makeUniqueEntryPath(rawPath: string, usedPaths: Set<string>): string {
	if (!usedPaths.has(rawPath)) {
		usedPaths.add(rawPath);
		return rawPath;
	}
	const lastSlash = rawPath.lastIndexOf('/');
	const dir = lastSlash >= 0 ? rawPath.slice(0, lastSlash + 1) : '';
	const file = lastSlash >= 0 ? rawPath.slice(lastSlash + 1) : rawPath;
	const dot = file.lastIndexOf('.');
	const stem = dot > 0 ? file.slice(0, dot) : file;
	const ext = dot > 0 ? file.slice(dot) : '';

	let counter = 1;
	while (true) {
		const candidate = `${dir}${stem} (${counter})${ext}`;
		if (!usedPaths.has(candidate)) {
			usedPaths.add(candidate);
			return candidate;
		}
		counter += 1;
	}
}

export async function buildZipArchive(
	tenantId: string,
	tenantMembership: Pick<TenantMember, 'role'>,
	userId: string,
	input: {
		fileIds: string[];
		folderIds: string[];
		archiveName?: string;
	},
): Promise<{
	buffer: Buffer;
	fileName: string;
	fileCount: number;
}> {
	const entries: Array<{
		archivePath: string;
		objectKey: string;
		sizeBytes: bigint;
	}> = [];
	const usedPaths = new Set<string>();
	const seenFileIds = new Set<string>();
	let totalBytes = 0n;

	// 1. Explicitly requested files (require VIEWER permission)
	if (input.fileIds.length > 0) {
		const files = await prisma.file.findMany({
			where: {
				tenantId,
				id: { in: input.fileIds },
				deletedAt: null,
			},
		});
		const fileMap = new Map(files.map((f) => [f.id, f]));

		for (const fileId of input.fileIds) {
			const file = fileMap.get(fileId);
			if (!file) {
				throw new HTTPException(404, { message: 'Requested file not found' });
			}
			await assertFileAccess(tenantMembership, file, userId, 'VIEWER');
			if (seenFileIds.has(file.id)) continue;
			seenFileIds.add(file.id);

			totalBytes += file.sizeBytes;
			entries.push({
				archivePath: makeUniqueEntryPath(sanitizeSegment(file.name), usedPaths),
				objectKey: file.objectKey,
				sizeBytes: file.sizeBytes,
			});
		}
	}

	// 2. Requested folders + recursive descendants
	for (const rootFolderId of input.folderIds) {
		const rootFolder = await prisma.folder.findFirst({
			where: { id: rootFolderId, tenantId, deletedAt: null },
		});
		if (!rootFolder) {
			throw new HTTPException(404, { message: 'Requested folder not found' });
		}

		const folderPathById = new Map<string, string>([
			[rootFolder.id, sanitizeSegment(rootFolder.name)],
		]);
		const folderIdsInTree: string[] = [rootFolder.id];
		let frontier: string[] = [rootFolder.id];

		while (frontier.length > 0) {
			const children = await prisma.folder.findMany({
				where: {
					tenantId,
					parentFolderId: { in: frontier },
					deletedAt: null,
				},
				orderBy: { name: 'asc' },
			});
			const nextFrontier: string[] = [];
			for (const child of children) {
				const parentPath =
					(child.parentFolderId ? folderPathById.get(child.parentFolderId) : '') ?? '';
				const childPath = parentPath
					? `${parentPath}/${sanitizeSegment(child.name)}`
					: sanitizeSegment(child.name);
				folderPathById.set(child.id, childPath);
				folderIdsInTree.push(child.id);
				nextFrontier.push(child.id);
			}
			frontier = nextFrontier;
		}

		const folderFiles = await prisma.file.findMany({
			where: {
				tenantId,
				folderId: { in: folderIdsInTree },
				deletedAt: null,
			},
			orderBy: { name: 'asc' },
		});

		for (const file of folderFiles) {
			if (seenFileIds.has(file.id)) continue;
			const role = await resolveEffectiveFileRole(tenantMembership, file, userId);
			if (!role) continue;

			seenFileIds.add(file.id);
			totalBytes += file.sizeBytes;
			const folderPrefix = file.folderId
				? folderPathById.get(file.folderId) ?? ''
				: '';
			const rawPath = folderPrefix
				? `${folderPrefix}/${sanitizeSegment(file.name)}`
				: sanitizeSegment(file.name);
			entries.push({
				archivePath: makeUniqueEntryPath(rawPath, usedPaths),
				objectKey: file.objectKey,
				sizeBytes: file.sizeBytes,
			});
		}
	}

	if (entries.length === 0) {
		throw new HTTPException(400, {
			message: 'No authorized files found in the selected items',
		});
	}
	if (entries.length > MAX_ARCHIVE_FILES) {
		throw new HTTPException(413, {
			message: `Archive cannot exceed ${MAX_ARCHIVE_FILES} files`,
		});
	}
	if (totalBytes > BigInt(MAX_ARCHIVE_BYTES)) {
		throw new HTTPException(413, {
			message: 'Selected items exceed the 250 MB ZIP archive limit',
		});
	}

	const archiveName = sanitizeArchiveName(input.archiveName);

	const buffer = await new Promise<Buffer>((resolve, reject) => {
		const archive = new ZipArchive({ zlib: { level: 6 } });
		const passThrough = new PassThrough();
		const chunks: Buffer[] = [];

		passThrough.on('data', (chunk: Buffer) => chunks.push(chunk));
		passThrough.on('end', () => resolve(Buffer.concat(chunks)));
		passThrough.on('error', reject);
		archive.on('error', reject);

		archive.pipe(passThrough);

		void (async () => {
			try {
				for (const entry of entries) {
					const bytes = await getStorageObjectBytes(entry.objectKey);
					archive.append(bytes, { name: entry.archivePath });
				}
				await archive.finalize();
			} catch (err) {
				reject(err);
			}
		})();
	});

	await prisma.$transaction(async (tx) => {
		await tx.tenantAnalytics.upsert({
			where: { tenantId },
			create: { tenantId, totalDownloads: 1n },
			update: { totalDownloads: { increment: 1 } },
		});

		await tx.activity.create({
			data: {
				tenantId,
				actorId: userId,
				action: 'FILE_DOWNLOADED',
				targetType: 'TENANT',
				targetName: archiveName,
				metadata: {
					archive: true,
					fileCount: entries.length,
				},
			},
		});
	});

	return {
		buffer,
		fileName: archiveName,
		fileCount: entries.length,
	};
}
