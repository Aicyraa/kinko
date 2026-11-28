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
const {
	deleteStorageObject,
	getStorageObjectBytes,
	headStorageObject,
	putStorageObject,
} = await import('../../lib/storage.ts');

const userA = {
	id: randomUUID(),
	email: `p2-a-${Date.now()}@kinko.test`,
	name: 'Phase2 Alice',
};

const userB = {
	id: randomUUID(),
	email: `p2-b-${Date.now()}@kinko.test`,
	name: 'Phase2 Bob',
};

const createdS3Keys: string[] = [];

function asUser(user: typeof userA | null) {
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

describe('Phase 2 Core File & Folder API (#23-#32)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterAll(async () => {
		for (const key of createdS3Keys) {
			await deleteStorageObject(key).catch(() => {});
		}
		await prisma.tenant.deleteMany({
			where: { ownerId: { in: [userA.id, userB.id] } },
		});
		await prisma.userProfile.deleteMany({
			where: { id: { in: [userA.id, userB.id] } },
		});
		await prisma.$disconnect();
	});

	it('performs S3 object round-trip against Neon Object Storage (#27)', async () => {
		const key = `test-smoke/${randomUUID()}.txt`;
		createdS3Keys.push(key);
		const payload = Buffer.from('kinko-s3-roundtrip-check', 'utf8');

		await putStorageObject({
			key,
			body: payload,
			contentType: 'text/plain',
		});

		const head = await headStorageObject(key);
		expect(head.exists).toBe(true);
		if (head.exists) {
			expect(head.contentLength).toBe(payload.length);
		}

		const downloaded = await getStorageObjectBytes(key);
		expect(downloaded.equals(payload)).toBe(true);

		await deleteStorageObject(key);
		const afterDelete = await headStorageObject(key);
		expect(afterDelete.exists).toBe(false);
	});

	it('supports folder CRUD, breadcrumbs, cycle prevention, and recursive soft delete (#25, #31)', async () => {
		asUser(userA);

		// Create parent & child folders
		const pRes = await app.request('/api/v1/folders', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'Projects' }),
		});
		expect(pRes.status).toBe(201);
		const parent = ((await pRes.json()) as { payload: { folder: { id: string } } })
			.payload.folder;

		const cRes = await app.request('/api/v1/folders', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: '2026', parentFolderId: parent.id }),
		});
		expect(cRes.status).toBe(201);
		const child = ((await cRes.json()) as { payload: { folder: { id: string } } })
			.payload.folder;

		// Breadcrumbs check
		const detailRes = await app.request(`/api/v1/folders/${child.id}`);
		expect(detailRes.status).toBe(200);
		const detail = (
			await detailRes.json()
		) as { payload: { breadcrumbs: Array<{ id: string; name: string }> } };
		expect(detail.payload.breadcrumbs.map((b) => b.name)).toEqual([
			'Projects',
			'2026',
		]);

		// Cycle prevention: moving parent into child must fail with 400
		const cycleRes = await app.request(`/api/v1/folders/${parent.id}/move`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ targetParentFolderId: child.id }),
		});
		expect(cycleRes.status).toBe(400);

		// Rename child
		const renameRes = await app.request(`/api/v1/folders/${child.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: '2026-Q4' }),
		});
		expect(renameRes.status).toBe(200);

		// Recursive soft-delete parent
		const delRes = await app.request(`/api/v1/folders/${parent.id}`, {
			method: 'DELETE',
		});
		expect(delRes.status).toBe(200);
		const delBody = (
			await delRes.json()
		) as { payload: { deletedFolderCount: number } };
		expect(delBody.payload.deletedFolderCount).toBe(2);

		// Child should now be hidden
		const afterDel = await app.request(`/api/v1/folders/${child.id}`);
		expect(afterDel.status).toBe(404);
	});

	it('handles presigned upload intent, HeadObject verification, download, soft delete, quota & isolation (#26, #28-#32)', async () => {
		asUser(userA);

		// Create upload intent
		const content = Buffer.from('Hello Kinko Production Vault!', 'utf8');
		const checksum = createHash('sha256').update(content).digest('hex');

		const intentRes = await app.request('/api/v1/uploads', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				fileName: 'hello-vault.txt',
				mimeType: 'text/plain',
				sizeBytes: content.length,
			}),
		});
		expect(intentRes.status).toBe(201);
		const intentPayload = (
			await intentRes.json()
		) as {
			payload: {
				upload: { id: string; tenantId: string };
				uploadUrl: string;
				requiredHeaders: Record<string, string>;
			};
		};
		const uploadId = intentPayload.payload.upload.id;
		const tenantAId = intentPayload.payload.upload.tenantId;

		// Track S3 key for cleanup
		const uploadRow = await prisma.upload.findUnique({
			where: { id: uploadId },
		});
		if (uploadRow) createdS3Keys.push(uploadRow.objectKey);

		// Completing before PUT must fail (400)
		const prematureRes = await app.request(
			`/api/v1/uploads/${uploadId}/complete`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ checksumSha256: checksum }),
			},
		);
		expect(prematureRes.status).toBe(400);

		// Real PUT to presigned Neon Object Storage URL
		const putRes = await fetch(intentPayload.payload.uploadUrl, {
			method: 'PUT',
			headers: intentPayload.payload.requiredHeaders,
			body: content,
		});
		expect(putRes.ok).toBe(true);

		// Complete upload
		const completeRes = await app.request(
			`/api/v1/uploads/${uploadId}/complete`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ checksumSha256: checksum }),
			},
		);
		expect(completeRes.status).toBe(200);
		const file = (
			await completeRes.json()
		) as { payload: { file: { id: string; name: string; sizeBytes: number } } };
		const fileId = file.payload.file.id;
		expect(file.payload.file.sizeBytes).toBe(content.length);

		// Listing includes file
		const listRes = await app.request('/api/v1/files');
		expect(listRes.status).toBe(200);
		const listBody = (
			await listRes.json()
		) as { payload: { items: Array<{ id: string }> } };
		expect(listBody.payload.items.some((f) => f.id === fileId)).toBe(true);

		// Authorized download returns working presigned GET URL with exact bytes
		const dlRes = await app.request(`/api/v1/files/${fileId}/download`);
		expect(dlRes.status).toBe(200);
		const dlBody = (
			await dlRes.json()
		) as { payload: { downloadUrl: string } };
		const fetched = await fetch(dlBody.payload.downloadUrl);
		expect(fetched.ok).toBe(true);
		const fetchedText = await fetched.text();
		expect(fetchedText).toBe(content.toString('utf8'));

		// Cross-tenant isolation: User B cannot access User A's file or download URL
		asUser(userB);
		const bForbidden = await app.request(`/api/v1/files/${fileId}`, {
			headers: { 'X-Tenant-Id': tenantAId },
		});
		expect(bForbidden.status).toBe(403);

		const bNotFound = await app.request(`/api/v1/files/${fileId}/download`);
		expect(bNotFound.status).toBe(404);

		// Switch back to User A and soft-delete file (S3 object must remain!)
		asUser(userA);
		const softDelRes = await app.request(`/api/v1/files/${fileId}`, {
			method: 'DELETE',
		});
		expect(softDelRes.status).toBe(200);

		const listAfterDel = await app.request('/api/v1/files');
		const listAfterBody = (
			await listAfterDel.json()
		) as { payload: { items: Array<{ id: string }> } };
		expect(listAfterBody.payload.items.some((f) => f.id === fileId)).toBe(
			false,
		);

		if (uploadRow) {
			const headStillThere = await headStorageObject(uploadRow.objectKey);
			expect(headStillThere.exists).toBe(true);
		}

		// Oversized & quota checks (#32)
		const tooBigRes = await app.request('/api/v1/uploads', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				fileName: 'huge.bin',
				mimeType: 'application/octet-stream',
				sizeBytes: 900_000_000,
			}),
		});
		expect(tooBigRes.status).toBe(413);

		// Lower User A's tenant quota to 10 bytes and verify upload intent is rejected
		await prisma.tenant.update({
			where: { id: tenantAId },
			data: { storageQuotaBytes: 10n },
		});
		const overQuotaRes = await app.request('/api/v1/uploads', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				fileName: 'over-quota.txt',
				mimeType: 'text/plain',
				sizeBytes: 20,
			}),
		});
		expect(overQuotaRes.status).toBe(413);
	});
});
