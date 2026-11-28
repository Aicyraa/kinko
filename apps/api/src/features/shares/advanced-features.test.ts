import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSession = vi.fn();

vi.mock('../../lib/serverAuth.ts', () => ({
	serverAuth: {
		getSession: mockGetSession,
		signUp: { email: vi.fn() },
		signIn: { email: vi.fn() },
		signOut: vi.fn(),
	},
}));

const { app } = await import('../../app.ts');
const { prisma } = await import('../../lib/prisma.ts');
const { deleteStorageObject } = await import('../../lib/storage.ts');

const ownerUser = {
	id: randomUUID(),
	email: `p6-owner-${Date.now()}@kinko.test`,
	name: 'Phase6 Owner',
};

const memberUser = {
	id: randomUUID(),
	email: `p6-member-${Date.now()}@kinko.test`,
	name: 'Phase6 Member',
};

const uploadedKeysToCleanup: string[] = [];

function asUser(user: typeof ownerUser | null) {
	if (!user) {
		mockGetSession.mockResolvedValue({ data: null, error: null });
		return;
	}
	mockGetSession.mockResolvedValue({
		data: {
			user,
			session: {
				id: randomUUID(),
				userId: user.id,
				expiresAt: new Date(Date.now() + 60_000).toISOString(),
			},
		},
		error: null,
	});
}

async function uploadSmallFile(
	tenantId: string,
	params: {
		fileName: string;
		content: Buffer;
		mimeType?: string;
		folderId?: string | null;
		omitChecksum?: boolean;
	},
) {
	const mimeType = params.mimeType ?? 'text/plain';
	const intentRes = await app.request('/api/v1/uploads', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Tenant-Id': tenantId,
		},
		body: JSON.stringify({
			fileName: params.fileName,
			mimeType,
			sizeBytes: params.content.byteLength,
			folderId: params.folderId ?? null,
		}),
	});
	expect(intentRes.status).toBe(201);
	const intentJson = (await intentRes.json()) as {
		payload: {
			upload: { id: string };
			uploadUrl: string;
			requiredHeaders: Record<string, string>;
		};
	};

	const putRes = await fetch(intentJson.payload.uploadUrl, {
		method: 'PUT',
		headers: intentJson.payload.requiredHeaders,
		body: new Uint8Array(params.content),
	});
	expect(putRes.ok).toBe(true);

	const checksumSha256 = createHash('sha256')
		.update(params.content)
		.digest('hex');

	const completeRes = await app.request(
		`/api/v1/uploads/${intentJson.payload.upload.id}/complete`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Tenant-Id': tenantId,
			},
			body: JSON.stringify(
				params.omitChecksum ? {} : { checksumSha256 },
			),
		},
	);
	expect(completeRes.status).toBe(200);
	const completeJson = (await completeRes.json()) as {
		payload: {
			file: { id: string; name: string; sizeBytes: number; currentVersion: number; checksumSha256: string | null };
			isDuplicate: boolean;
			duplicateOf: Array<{ id: string }>;
		};
	};

	const dbFile = await prisma.file.findUnique({
		where: { id: completeJson.payload.file.id },
		select: { objectKey: true },
	});
	if (dbFile?.objectKey) {
		uploadedKeysToCleanup.push(dbFile.objectKey);
	}

	return completeJson.payload;
}

describe('Phase 6 Advanced Features API (#63-#70)', () => {
	let tenantId = '';

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterAll(async () => {
		if (tenantId) {
			const versions = await prisma.fileVersion.findMany({
				where: { tenantId },
				select: { objectKey: true },
			});
			for (const v of versions) {
				uploadedKeysToCleanup.push(v.objectKey);
			}
		}
		await Promise.all(
			Array.from(new Set(uploadedKeysToCleanup)).map((key) =>
				deleteStorageObject(key).catch(() => {}),
			),
		);
		await prisma.tenant.deleteMany({
			where: { ownerId: { in: [ownerUser.id, memberUser.id] } },
		});
		await prisma.userProfile.deleteMany({
			where: { id: { in: [ownerUser.id, memberUser.id] } },
		});
		await prisma.$disconnect();
	});

	it('provisions owner & member, enforces favorites (#63), shares (#65), permissions (#66), ZIP (#67), duplicates (#68), versions (#69), and audit logs (#64)', async () => {
		// Onboard ownerUser & memberUser
		asUser(ownerUser);
		const ownerTenantsRes = await app.request('/api/v1/tenants');
		expect(ownerTenantsRes.status).toBe(200);
		const ownerTenantsJson = (await ownerTenantsRes.json()) as {
			payload: { tenants: Array<{ id: string }> };
		};
		tenantId = ownerTenantsJson.payload.tenants[0]?.id ?? '';
		expect(tenantId).toBeTruthy();

		asUser(memberUser);
		const memberOnboardRes = await app.request('/api/v1/tenants');
		expect(memberOnboardRes.status).toBe(200);

		// Add memberUser as MEMBER to ownerUser's tenant
		await prisma.tenantMember.create({
			data: { tenantId, userId: memberUser.id, role: 'MEMBER' },
		});

		asUser(ownerUser);

		// Create a folder and upload a file
		const folderRes = await app.request('/api/v1/folders', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Tenant-Id': tenantId,
			},
			body: JSON.stringify({ name: 'Specs', parentFolderId: null }),
		});
		expect(folderRes.status).toBe(201);
		const folderId = ((await folderRes.json()) as { payload: { folder: { id: string } } }).payload.folder.id;

		const v1Content = Buffer.from('Kinko v1 specification content', 'utf8');
		const firstUpload = await uploadSmallFile(tenantId, {
			fileName: 'spec.txt',
			content: v1Content,
			folderId,
		});
		const fileId = firstUpload.file.id;
		expect(firstUpload.isDuplicate).toBe(false);

		// #68 Duplicate detection: upload identical content without client checksum
		const secondUpload = await uploadSmallFile(tenantId, {
			fileName: 'spec-copy.txt',
			content: v1Content,
			folderId: null,
			omitChecksum: true,
		});
		expect(secondUpload.isDuplicate).toBe(true);
		expect(secondUpload.duplicateOf.some((d) => d.id === fileId)).toBe(true);

		const dupRes = await app.request('/api/v1/files/duplicates', {
			headers: { 'X-Tenant-Id': tenantId },
		});
		expect(dupRes.status).toBe(200);
		const dupJson = (await dupRes.json()) as {
			payload: { groups: Array<{ count: number }> };
		};
		expect(dupJson.payload.groups.length).toBeGreaterThanOrEqual(1);
		expect(dupJson.payload.groups[0]?.count).toBe(2);

		// #63 Favorites: star file & folder, list, then unstar
		const favFileRes = await app.request('/api/v1/favorites', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
			body: JSON.stringify({ targetType: 'FILE', targetId: fileId }),
		});
		expect(favFileRes.status).toBe(201);

		const favFolderRes = await app.request('/api/v1/favorites', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
			body: JSON.stringify({ targetType: 'FOLDER', targetId: folderId }),
		});
		expect(favFolderRes.status).toBe(201);

		const listFavRes = await app.request('/api/v1/favorites', {
			headers: { 'X-Tenant-Id': tenantId },
		});
		expect(listFavRes.status).toBe(200);
		const listFavJson = (await listFavRes.json()) as {
			payload: { fileIds: string[]; folderIds: string[] };
		};
		expect(listFavJson.payload.fileIds).toContain(fileId);
		expect(listFavJson.payload.folderIds).toContain(folderId);

		const unfavRes = await app.request(`/api/v1/favorites/FOLDER/${folderId}`, {
			method: 'DELETE',
			headers: { 'X-Tenant-Id': tenantId },
		});
		expect(unfavRes.status).toBe(200);

		// #69 File Versioning: upload v2, list versions, download v1, restore v1 -> v3
		const v2Content = Buffer.from('Kinko v2 specification updated', 'utf8');
		const v2IntentRes = await app.request(`/api/v1/files/${fileId}/versions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
			body: JSON.stringify({ mimeType: 'text/plain', sizeBytes: v2Content.byteLength }),
		});
		expect(v2IntentRes.status).toBe(201);
		const v2Intent = (await v2IntentRes.json()) as {
			payload: {
				upload: { id: string };
				uploadUrl: string;
				requiredHeaders: Record<string, string>;
			};
		};
		const putV2 = await fetch(v2Intent.payload.uploadUrl, {
			method: 'PUT',
			headers: v2Intent.payload.requiredHeaders,
			body: new Uint8Array(v2Content),
		});
		expect(putV2.ok).toBe(true);

		const completeV2 = await app.request(
			`/api/v1/uploads/${v2Intent.payload.upload.id}/complete`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
				body: JSON.stringify({}),
			},
		);
		expect(completeV2.status).toBe(200);

		const versionsRes = await app.request(`/api/v1/files/${fileId}/versions`, {
			headers: { 'X-Tenant-Id': tenantId },
		});
		expect(versionsRes.status).toBe(200);
		const versionsJson = (await versionsRes.json()) as {
			payload: { versions: Array<{ id: string; versionNumber: number }> };
		};
		expect(versionsJson.payload.versions.map((v) => v.versionNumber)).toEqual([2, 1]);
		const v1Id = versionsJson.payload.versions[1]?.id as string;

		const v1DlRes = await app.request(
			`/api/v1/files/${fileId}/versions/${v1Id}/download`,
			{ headers: { 'X-Tenant-Id': tenantId } },
		);
		expect(v1DlRes.status).toBe(200);
		const v1DlJson = (await v1DlRes.json()) as { payload: { downloadUrl: string } };
		const fetchedV1 = await (await fetch(v1DlJson.payload.downloadUrl)).text();
		expect(fetchedV1).toBe(v1Content.toString('utf8'));

		const restoreRes = await app.request(
			`/api/v1/files/${fileId}/versions/${v1Id}/restore`,
			{ method: 'POST', headers: { 'X-Tenant-Id': tenantId } },
		);
		expect(restoreRes.status).toBe(200);
		const restoreJson = (await restoreRes.json()) as {
			payload: { file: { currentVersion: number } };
		};
		expect(restoreJson.payload.file.currentVersion).toBe(3);

		// #66 Permissions: grant VIEWER -> EDITOR -> OWNER to memberUser
		const grantViewerRes = await app.request(`/api/v1/permissions/file/${fileId}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
			body: JSON.stringify({ userId: memberUser.id, role: 'VIEWER' }),
		});
		expect(grantViewerRes.status).toBe(200);

		asUser(memberUser);
		const viewerRead = await app.request(`/api/v1/files/${fileId}`, {
			headers: { 'X-Tenant-Id': tenantId },
		});
		expect(viewerRead.status).toBe(200);

		const viewerRename = await app.request(`/api/v1/files/${fileId}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
			body: JSON.stringify({ name: 'nope.txt' }),
		});
		expect(viewerRename.status).toBe(403);

		const viewerDelete = await app.request(`/api/v1/files/${fileId}`, {
			method: 'DELETE',
			headers: { 'X-Tenant-Id': tenantId },
		});
		expect(viewerDelete.status).toBe(403);

		asUser(ownerUser);
		const grantEditorRes = await app.request(`/api/v1/permissions/file/${fileId}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
			body: JSON.stringify({ userId: memberUser.id, role: 'EDITOR' }),
		});
		expect(grantEditorRes.status).toBe(200);

		asUser(memberUser);
		const editorRename = await app.request(`/api/v1/files/${fileId}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
			body: JSON.stringify({ name: 'spec-renamed.txt' }),
		});
		expect(editorRename.status).toBe(200);

		const editorShare = await app.request('/api/v1/shares', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
			body: JSON.stringify({ fileId }),
		});
		expect(editorShare.status).toBe(403);

		// #67 ZIP download: includes spec-renamed.txt inside Specs/ and spec-copy.txt
		const zipRes = await app.request('/api/v1/downloads/zip', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
			body: JSON.stringify({
				fileIds: [secondUpload.file.id],
				folderIds: [folderId],
				archiveName: 'phase6-bundle',
			}),
		});
		expect(zipRes.status).toBe(200);
		expect(zipRes.headers.get('Content-Type')).toBe('application/zip');
		const zipBuf = Buffer.from(await zipRes.arrayBuffer());
		expect(zipBuf.subarray(0, 2).toString('ascii')).toBe('PK');
		expect(zipBuf.includes(Buffer.from('spec-renamed.txt'))).toBe(true);
		expect(zipBuf.includes(Buffer.from('spec-copy.txt'))).toBe(true);

		// #65 Share links: password protected, public access, revoke, expired
		asUser(ownerUser);
		const createShareRes = await app.request('/api/v1/shares', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
			body: JSON.stringify({
				fileId,
				password: 'VaultSecret#1',
				expiresInHours: 24,
			}),
		});
		expect(createShareRes.status).toBe(201);
		const sharePayload = (await createShareRes.json()) as {
			payload: { share: { id: string }; token: string };
		};
		const shareToken = sharePayload.payload.token;
		const shareId = sharePayload.payload.share.id;

		asUser(null);
		const pubMetaRes = await app.request(`/api/v1/shares/public/${shareToken}`);
		expect(pubMetaRes.status).toBe(200);
		const pubMetaJson = (await pubMetaRes.json()) as {
			payload: { share: { requiresPassword: boolean } };
		};
		expect(pubMetaJson.payload.share.requiresPassword).toBe(true);

		const badPassRes = await app.request(
			`/api/v1/shares/public/${shareToken}/access`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: 'wrong-password' }),
			},
		);
		expect(badPassRes.status).toBe(401);

		const goodPassRes = await app.request(
			`/api/v1/shares/public/${shareToken}/access`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: 'VaultSecret#1' }),
			},
		);
		expect(goodPassRes.status).toBe(200);
		const goodPassJson = (await goodPassRes.json()) as {
			payload: { downloadUrl: string };
		};
		expect(goodPassJson.payload.downloadUrl).toContain('http');

		asUser(ownerUser);
		const revokeRes = await app.request(`/api/v1/shares/${shareId}`, {
			method: 'DELETE',
			headers: { 'X-Tenant-Id': tenantId },
		});
		expect(revokeRes.status).toBe(200);

		asUser(null);
		const revokedMetaRes = await app.request(`/api/v1/shares/public/${shareToken}`);
		expect(revokedMetaRes.status).toBe(410);

		// #64 Audit logs: verify actions recorded and secrets stripped
		asUser(ownerUser);
		const auditRes = await app.request(
			'/api/v1/activities?action=FILE_SHARED&limit=20',
			{ headers: { 'X-Tenant-Id': tenantId } },
		);
		expect(auditRes.status).toBe(200);
		const auditJson = (await auditRes.json()) as {
			payload: { items: Array<{ action: string; metadata: Record<string, unknown> | null }> };
		};
		expect(auditJson.payload.items.length).toBeGreaterThanOrEqual(1);
		expect(auditJson.payload.items[0]?.action).toBe('FILE_SHARED');
		expect(JSON.stringify(auditJson.payload.items)).not.toContain(shareToken);
		expect(JSON.stringify(auditJson.payload.items)).not.toContain('VaultSecret#1');
	}, 30_000);

	it('supports S3 multipart upload initiation, partial state resume, and completion (#70)', async () => {
		asUser(ownerUser);
		const part1Size = 5 * 1024 * 1024;
		const part2Size = 1024;
		const totalSize = part1Size + part2Size;

		const initRes = await app.request('/api/v1/uploads/multipart', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
			body: JSON.stringify({
				fileName: 'large-archive.bin',
				mimeType: 'application/octet-stream',
				sizeBytes: totalSize,
				partSizeBytes: part1Size,
			}),
		});
		expect(initRes.status).toBe(201);
		const initJson = (await initRes.json()) as {
			payload: { upload: { id: string }; totalParts: number };
		};
		expect(initJson.payload.totalParts).toBe(2);
		const uploadId = initJson.payload.upload.id;

		// Upload Part 1
		const url1Res = await app.request(
			`/api/v1/uploads/multipart/${uploadId}/parts/1/url`,
			{ method: 'POST', headers: { 'X-Tenant-Id': tenantId } },
		);
		expect(url1Res.status).toBe(200);
		const { uploadUrl: url1 } = (
			(await url1Res.json()) as { payload: { uploadUrl: string } }
		).payload;

		const part1Buf = Buffer.alloc(part1Size, 0x41);
		const put1 = await fetch(url1, { method: 'PUT', body: new Uint8Array(part1Buf) });
		expect(put1.ok).toBe(true);
		const eTag1 = put1.headers.get('etag');
		expect(eTag1).toBeTruthy();

		const rec1 = await app.request(
			`/api/v1/uploads/multipart/${uploadId}/parts/1`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
				body: JSON.stringify({ eTag: eTag1, sizeBytes: part1Size }),
			},
		);
		expect(rec1.status).toBe(200);

		// Verify resume state reports part 1 completed and part 2 remaining
		const stateRes = await app.request(`/api/v1/uploads/multipart/${uploadId}`, {
			headers: { 'X-Tenant-Id': tenantId },
		});
		expect(stateRes.status).toBe(200);
		const stateJson = (await stateRes.json()) as {
			payload: {
				completedParts: Array<{ partNumber: number }>;
				remainingPartNumbers: number[];
			};
		};
		expect(stateJson.payload.completedParts.map((p) => p.partNumber)).toEqual([1]);
		expect(stateJson.payload.remainingPartNumbers).toEqual([2]);

		// Upload Part 2
		const url2Res = await app.request(
			`/api/v1/uploads/multipart/${uploadId}/parts/2/url`,
			{ method: 'POST', headers: { 'X-Tenant-Id': tenantId } },
		);
		expect(url2Res.status).toBe(200);
		const { uploadUrl: url2 } = (
			(await url2Res.json()) as { payload: { uploadUrl: string } }
		).payload;

		const part2Buf = Buffer.alloc(part2Size, 0x42);
		const put2 = await fetch(url2, { method: 'PUT', body: new Uint8Array(part2Buf) });
		expect(put2.ok).toBe(true);
		const eTag2 = put2.headers.get('etag');
		expect(eTag2).toBeTruthy();

		const rec2 = await app.request(
			`/api/v1/uploads/multipart/${uploadId}/parts/2`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
				body: JSON.stringify({ eTag: eTag2, sizeBytes: part2Size }),
			},
		);
		expect(rec2.status).toBe(200);

		// Complete Multipart Upload
		const completeRes = await app.request(
			`/api/v1/uploads/multipart/${uploadId}/complete`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
				body: JSON.stringify({}),
			},
		);
		expect(completeRes.status).toBe(200);
		const completeJson = (await completeRes.json()) as {
			payload: { file: { id: string; sizeBytes: number; name: string } };
		};
		expect(completeJson.payload.file.name).toBe('large-archive.bin');
		expect(completeJson.payload.file.sizeBytes).toBe(totalSize);

		const dbFile = await prisma.file.findUnique({
			where: { id: completeJson.payload.file.id },
			select: { objectKey: true },
		});
		if (dbFile?.objectKey) {
			uploadedKeysToCleanup.push(dbFile.objectKey);
		}
	}, 45_000);
});
