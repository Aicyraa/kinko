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
const { headStorageObject, putStorageObject, deleteStorageObject } =
	await import('../../lib/storage.ts');
const { purgeExpiredTrash } = await import('./trash.cleanup.ts');

const userA = {
	id: randomUUID(),
	email: `p4-a-${Date.now()}@kinko.test`,
	name: 'Phase4 Alice',
};

const userB = {
	id: randomUUID(),
	email: `p4-b-${Date.now()}@kinko.test`,
	name: 'Phase4 Bob',
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

describe('Phase 4 Trash, Cleanup & Search API (#48-#54)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterAll(async () => {
		for (const key of cleanupKeys) {
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

	it('supports trash listing, restore, permanent deletion (S3 + DB), and expired-trash cleanup (#48-#51)', async () => {
		asUser(userA);
		const tenantsRes = await app.request('/api/v1/tenants');
		const rawTenantId = (
			(await tenantsRes.json()) as {
				payload: { tenants: Array<{ id: string }> };
			}
		).payload.tenants[0]?.id;
		expect(rawTenantId).toBeTruthy();
		if (!rawTenantId) throw new Error('Missing tenantId');
		const tenantId = rawTenantId;

		// Upload a file via S3 + DB
		const key1 = `${tenantId}/${randomUUID()}/trash-test-1.txt`;
		cleanupKeys.push(key1);
		const body1 = Buffer.from('trash-restore-delete-test', 'utf8');
		await putStorageObject({ key: key1, body: body1, contentType: 'text/plain' });

		const file1 = await prisma.file.create({
			data: {
				tenantId,
				uploadedById: userA.id,
				name: 'trash-test-1.txt',
				objectKey: key1,
				mimeType: 'text/plain',
				sizeBytes: BigInt(body1.length),
			},
		});
		await prisma.tenantAnalytics.update({
			where: { tenantId },
			data: {
				storageUsedBytes: BigInt(body1.length),
				totalFiles: 1,
			},
		});

		// Soft-delete file1
		const delRes = await app.request(`/api/v1/files/${file1.id}`, {
			method: 'DELETE',
		});
		expect(delRes.status).toBe(200);

		// Appears in GET /trash
		const trashRes = await app.request('/api/v1/trash');
		expect(trashRes.status).toBe(200);
		const trashJson = (await trashRes.json()) as {
			payload: { items: Array<{ id: string; kind: string }> };
		};
		expect(trashJson.payload.items.some((i) => i.id === file1.id)).toBe(true);

		// Restore file1
		const restoreRes = await app.request(
			`/api/v1/trash/${file1.id}/restore`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ kind: 'file' }),
			},
		);
		expect(restoreRes.status).toBe(200);

		// Back in active GET /files
		const activeRes = await app.request('/api/v1/files');
		const activeJson = (await activeRes.json()) as {
			payload: { items: Array<{ id: string }> };
		};
		expect(activeJson.payload.items.some((i) => i.id === file1.id)).toBe(true);

		// Soft-delete again, then permanently delete
		await app.request(`/api/v1/files/${file1.id}`, { method: 'DELETE' });
		const permRes = await app.request(`/api/v1/trash/${file1.id}`, {
			method: 'DELETE',
		});
		expect(permRes.status).toBe(200);

		// S3 object must be gone
		const headAfter = await headStorageObject(key1);
		expect(headAfter.exists).toBe(false);

		// Expired-trash cleanup job (#51): one expired (40 days ago) and one fresh (1 day ago)
		const expiredKey = `${tenantId}/${randomUUID()}/expired.txt`;
		const freshKey = `${tenantId}/${randomUUID()}/fresh.txt`;
		cleanupKeys.push(expiredKey, freshKey);

		await Promise.all([
			putStorageObject({
				key: expiredKey,
				body: 'old',
				contentType: 'text/plain',
			}),
			putStorageObject({
				key: freshKey,
				body: 'new',
				contentType: 'text/plain',
			}),
		]);

		const expiredFile = await prisma.file.create({
			data: {
				tenantId,
				uploadedById: userA.id,
				name: 'expired.txt',
				objectKey: expiredKey,
				mimeType: 'text/plain',
				sizeBytes: 3n,
				deletedAt: new Date(Date.now() - 40 * 86_400_000),
			},
		});
		const freshFile = await prisma.file.create({
			data: {
				tenantId,
				uploadedById: userA.id,
				name: 'fresh.txt',
				objectKey: freshKey,
				mimeType: 'text/plain',
				sizeBytes: 3n,
				deletedAt: new Date(Date.now() - 1 * 86_400_000),
			},
		});

		const cleanupRes = await purgeExpiredTrash({
			retentionDays: 30,
			tenantId,
		});
		expect(cleanupRes.purgedFiles).toBe(1);
		expect(await headStorageObject(expiredKey)).toEqual({ exists: false });
		expect((await headStorageObject(freshKey)).exists).toBe(true);
		expect(
			await prisma.file.findUnique({ where: { id: expiredFile.id } }),
		).toBeNull();
		expect(
			await prisma.file.findUnique({ where: { id: freshFile.id } }),
		).not.toBeNull();
	});

	it('searches by filename, type, date, size, and paginates with tenant isolation (#52-#54)', async () => {
		asUser(userA);
		const tenantsRes = await app.request('/api/v1/tenants');
		const tenantAId = (
			(await tenantsRes.json()) as {
				payload: { tenants: Array<{ id: string }> };
			}
		).payload.tenants[0]?.id;
		if (!tenantAId) throw new Error('Missing tenantAId');

		// Seed 3 distinct files for User A
		await prisma.file.createMany({
			data: [
				{
					tenantId: tenantAId,
					uploadedById: userA.id,
					name: 'quarterly-report.pdf',
					objectKey: `${tenantAId}/${randomUUID()}/r.pdf`,
					mimeType: 'application/pdf',
					sizeBytes: 5000n,
				},
				{
					tenantId: tenantAId,
					uploadedById: userA.id,
					name: 'hero-banner.png',
					objectKey: `${tenantAId}/${randomUUID()}/h.png`,
					mimeType: 'image/png',
					sizeBytes: 200_000n,
				},
				{
					tenantId: tenantAId,
					uploadedById: userA.id,
					name: 'annual-report.pdf',
					objectKey: `${tenantAId}/${randomUUID()}/a.pdf`,
					mimeType: 'application/pdf',
					sizeBytes: 9000n,
				},
			],
		});

		// Filename + type filter
		const qRes = await app.request('/api/v1/search?q=report&type=pdf');
		expect(qRes.status).toBe(200);
		const qJson = (await qRes.json()) as {
			payload: {
				items: Array<{ name: string }>;
				pagination: { total: number; totalPages: number };
			};
		};
		expect(qJson.payload.pagination.total).toBe(2);

		// Size filter
		const sizeRes = await app.request(
			'/api/v1/search?minSize=100000&type=image',
		);
		const sizeJson = (await sizeRes.json()) as {
			payload: { items: Array<{ name: string }> };
		};
		expect(sizeJson.payload.items.map((i) => i.name)).toEqual([
			'hero-banner.png',
		]);

		// Pagination (limit=1, page=2)
		const p2Res = await app.request(
			'/api/v1/search?q=report&type=pdf&page=2&limit=1',
		);
		const p2Json = (await p2Res.json()) as {
			payload: {
				items: Array<{ name: string }>;
				pagination: { page: number; total: number; totalPages: number };
			};
		};
		expect(p2Json.payload.items).toHaveLength(1);
		expect(p2Json.payload.pagination.page).toBe(2);
		expect(p2Json.payload.pagination.totalPages).toBe(2);

		// Cross-tenant isolation: User B sees 0 results for User A's files
		asUser(userB);
		const bRes = await app.request('/api/v1/search?q=report');
		expect(bRes.status).toBe(200);
		const bJson = (await bRes.json()) as {
			payload: { pagination: { total: number } };
		};
		expect(bJson.payload.pagination.total).toBe(0);
	});
});
