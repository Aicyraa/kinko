import { randomUUID } from 'node:crypto';
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
const { resetRateLimiters } = await import('../../middleware/rateLimit.ts');

const userA = {
	id: randomUUID(),
	email: `p7-a-${Date.now()}@kinko.test`,
	name: 'P7 Alice',
};

const userB = {
	id: randomUUID(),
	email: `p7-b-${Date.now()}@kinko.test`,
	name: 'P7 Bob',
};

const cleanupKeys: string[] = [];

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

describe('Cross-Tenant Isolation & Authorization Matrix (#72, #74)', () => {
	let tenantAId = '';
	let tenantBId = '';
	let folderAId = '';
	let fileAId = '';

	beforeEach(() => {
		vi.clearAllMocks();
		resetRateLimiters();
	});

	afterAll(async () => {
		await Promise.all(
			cleanupKeys.map((key) => deleteStorageObject(key).catch(() => {})),
		);
		await prisma.tenant.deleteMany({
			where: { ownerId: { in: [userA.id, userB.id] } },
		});
		await prisma.userProfile.deleteMany({
			where: { id: { in: [userA.id, userB.id] } },
		});
		await prisma.$disconnect();
	});

	it('denies unauthenticated requests with 401 across all protected routes (#74)', async () => {
		asUser(null);
		const dummyId = randomUUID();
		const endpoints: Array<[string, string]> = [
			['GET', '/api/v1/tenants'],
			['GET', '/api/v1/folders'],
			['GET', '/api/v1/files'],
			['GET', '/api/v1/trash'],
			['GET', '/api/v1/search?q=test'],
			['GET', '/api/v1/analytics/overview'],
			['GET', '/api/v1/activities'],
			['GET', '/api/v1/favorites'],
			['GET', `/api/v1/permissions/file/${dummyId}`],
			['POST', '/api/v1/downloads/zip'],
		];

		for (const [method, path] of endpoints) {
			const res = await app.request(path, { method });
			expect(res.status, `${method} ${path}`).toBe(401);
		}
	});

	it('denies cross-tenant header spoofing (403) and cross-tenant resource IDs (404) (#72, #74)', async () => {
		// Provision Tenant A + folder + file
		asUser(userA);
		const tARes = await app.request('/api/v1/tenants');
		tenantAId = ((await tARes.json()) as { payload: { tenants: Array<{ id: string }> } }).payload.tenants[0]?.id ?? '';

		const fRes = await app.request('/api/v1/folders', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantAId },
			body: JSON.stringify({ name: 'Confidential', parentFolderId: null }),
		});
		folderAId = ((await fRes.json()) as { payload: { folder: { id: string } } }).payload.folder.id;

		const payload = Buffer.from('secret tenant A payload', 'utf8');
		const upRes = await app.request('/api/v1/uploads', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantAId },
			body: JSON.stringify({
				fileName: 'secret.txt',
				mimeType: 'text/plain',
				sizeBytes: payload.byteLength,
				folderId: folderAId,
			}),
		});
		const upJson = (await upRes.json()) as {
			payload: { upload: { id: string }; uploadUrl: string; requiredHeaders: Record<string, string> };
		};
		await fetch(upJson.payload.uploadUrl, {
			method: 'PUT',
			headers: upJson.payload.requiredHeaders,
			body: new Uint8Array(payload),
		});
		const compRes = await app.request(`/api/v1/uploads/${upJson.payload.upload.id}/complete`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantAId },
			body: JSON.stringify({}),
		});
		fileAId = ((await compRes.json()) as { payload: { file: { id: string } } }).payload.file.id;
		const dbFile = await prisma.file.findUnique({ where: { id: fileAId }, select: { objectKey: true } });
		if (dbFile?.objectKey) cleanupKeys.push(dbFile.objectKey);

		// Provision Tenant B
		asUser(userB);
		const tBRes = await app.request('/api/v1/tenants');
		tenantBId = ((await tBRes.json()) as { payload: { tenants: Array<{ id: string }> } }).payload.tenants[0]?.id ?? '';

		// 1. User B spoofing X-Tenant-Id = tenantAId -> 403 everywhere
		const spoofRoutes: Array<[string, string, unknown?]> = [
			['GET', `/api/v1/folders/${folderAId}`],
			['GET', `/api/v1/files/${fileAId}`],
			['PATCH', `/api/v1/files/${fileAId}`, { name: 'hacked.txt' }],
			['DELETE', `/api/v1/files/${fileAId}`],
			['GET', `/api/v1/files/${fileAId}/download`],
			['GET', `/api/v1/files/${fileAId}/versions`],
			['POST', '/api/v1/favorites', { targetType: 'FILE', targetId: fileAId }],
			['POST', '/api/v1/shares', { fileId: fileAId }],
			['GET', `/api/v1/permissions/file/${fileAId}`],
			['POST', '/api/v1/downloads/zip', { fileIds: [fileAId], folderIds: [] }],
			['GET', '/api/v1/analytics/overview'],
			['GET', '/api/v1/activities'],
		];

		for (const [method, path, body] of spoofRoutes) {
			const res = await app.request(path, {
				method,
				headers: {
					'X-Tenant-Id': tenantAId,
					...(body ? { 'Content-Type': 'application/json' } : {}),
				},
				...(body ? { body: JSON.stringify(body) } : {}),
			});
			expect(res.status, `Spoof ${method} ${path}`).toBe(403);
		}

		// 2. User B using own tenantBId with Tenant A resource IDs -> 404 everywhere
		const crossIdRoutes: Array<[string, string, unknown?]> = [
			['GET', `/api/v1/folders/${folderAId}`],
			['GET', `/api/v1/files/${fileAId}`],
			['PATCH', `/api/v1/files/${fileAId}`, { name: 'hacked.txt' }],
			['DELETE', `/api/v1/files/${fileAId}`],
			['GET', `/api/v1/files/${fileAId}/download`],
			['GET', `/api/v1/files/${fileAId}/versions`],
			['POST', '/api/v1/favorites', { targetType: 'FILE', targetId: fileAId }],
			['POST', '/api/v1/shares', { fileId: fileAId }],
			['GET', `/api/v1/permissions/file/${fileAId}`],
			['POST', '/api/v1/downloads/zip', { fileIds: [fileAId], folderIds: [] }],
		];

		for (const [method, path, body] of crossIdRoutes) {
			const res = await app.request(path, {
				method,
				headers: {
					'X-Tenant-Id': tenantBId,
					...(body ? { 'Content-Type': 'application/json' } : {}),
				},
				...(body ? { body: JSON.stringify(body) } : {}),
			});
			expect(res.status, `Cross-ID ${method} ${path}`).toBe(404);
		}
	}, 30_000);
});
