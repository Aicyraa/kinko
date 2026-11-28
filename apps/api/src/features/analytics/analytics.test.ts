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

const userA = {
	id: randomUUID(),
	email: `p5-a-${Date.now()}@kinko.test`,
	name: 'Phase5 Alice',
};

const userB = {
	id: randomUUID(),
	email: `p5-b-${Date.now()}@kinko.test`,
	name: 'Phase5 Bob',
};

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

describe('Phase 5 Analytics & Activities API (#55-#62)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterAll(async () => {
		await prisma.tenant.deleteMany({
			where: { ownerId: { in: [userA.id, userB.id] } },
		});
		await prisma.userProfile.deleteMany({
			where: { id: { in: [userA.id, userB.id] } },
		});
		await prisma.$disconnect();
	});

	it('returns tenant-scoped overview, storage history, file-types, and activities with strict isolation', async () => {
		asUser(userA);
		const tRes = await app.request('/api/v1/tenants');
		const tenantAId = (
			(await tRes.json()) as { payload: { tenants: Array<{ id: string }> } }
		).payload.tenants[0]?.id;
		if (!tenantAId) throw new Error('Missing tenantAId');

		await prisma.file.createMany({
			data: [
				{
					tenantId: tenantAId,
					uploadedById: userA.id,
					name: 'spec.pdf',
					objectKey: `${tenantAId}/${randomUUID()}/spec.pdf`,
					mimeType: 'application/pdf',
					sizeBytes: 4000n,
				},
				{
					tenantId: tenantAId,
					uploadedById: userA.id,
					name: 'logo.png',
					objectKey: `${tenantAId}/${randomUUID()}/logo.png`,
					mimeType: 'image/png',
					sizeBytes: 2000n,
				},
				{
					tenantId: tenantAId,
					uploadedById: userA.id,
					name: 'deleted.png',
					objectKey: `${tenantAId}/${randomUUID()}/del.png`,
					mimeType: 'image/png',
					sizeBytes: 1000n,
					deletedAt: new Date(),
				},
			],
		});

		await prisma.tenantAnalytics.update({
			where: { tenantId: tenantAId },
			data: {
				storageUsedBytes: 7000n,
				totalFiles: 2,
				totalFolders: 1,
				totalUploads: 3n,
				totalDownloads: 5n,
			},
		});

		await prisma.activity.create({
			data: {
				tenantId: tenantAId,
				actorId: userA.id,
				action: 'FILE_UPLOADED',
				targetType: 'FILE',
				targetName: 'spec.pdf',
			},
		});

		const [overviewRes, storageRes, typesRes, actRes] = await Promise.all([
			app.request('/api/v1/analytics/overview'),
			app.request('/api/v1/analytics/storage?days=14'),
			app.request('/api/v1/analytics/file-types'),
			app.request('/api/v1/activities?limit=10'),
		]);

		expect(overviewRes.status).toBe(200);
		const overview = (
			(await overviewRes.json()) as {
				payload: {
					storageUsedBytes: number;
					totalFiles: number;
					totalUploads: number;
					totalDownloads: number;
					recentFiles: Array<{ name: string }>;
				};
			}
		).payload;
		expect(overview.storageUsedBytes).toBe(7000);
		expect(overview.totalFiles).toBe(2);
		expect(overview.totalUploads).toBe(3);
		expect(overview.totalDownloads).toBe(5);
		expect(overview.recentFiles).toHaveLength(2);

		expect(storageRes.status).toBe(200);
		const storage = (
			(await storageRes.json()) as {
				payload: { points: Array<{ date: string; storageUsedBytes: number }> };
			}
		).payload;
		expect(storage.points.length).toBeGreaterThanOrEqual(1);

		expect(typesRes.status).toBe(200);
		const types = (
			(await typesRes.json()) as {
				payload: {
					totalFiles: number;
					distribution: Array<{ category: string; count: number }>;
				};
			}
		).payload;
		expect(types.totalFiles).toBe(2);
		expect(types.distribution.find((d) => d.category === 'Images')?.count).toBe(
			1,
		);

		expect(actRes.status).toBe(200);
		const act = (
			(await actRes.json()) as {
				payload: { items: Array<{ targetName: string }> };
			}
		).payload;
		expect(act.items.some((a) => a.targetName === 'spec.pdf')).toBe(true);

		// Cross-tenant isolation: User B gets 0 files and 0 activities
		asUser(userB);
		const [bOverview, bAct] = await Promise.all([
			app.request('/api/v1/analytics/overview'),
			app.request('/api/v1/activities'),
		]);
		const bOverviewJson = (
			(await bOverview.json()) as { payload: { totalFiles: number } }
		).payload;
		const bActJson = (
			(await bAct.json()) as { payload: { items: unknown[] } }
		).payload;
		expect(bOverviewJson.totalFiles).toBe(0);
		expect(bActJson.items).toHaveLength(0);
	});
});
