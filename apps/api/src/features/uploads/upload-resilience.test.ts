import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
const { env, getMaxFileSizeBytes } = await import('../../env.ts');
const { prisma } = await import('../../lib/prisma.ts');
const { resetRateLimiters } = await import('../../middleware/rateLimit.ts');
const { cleanupExpiredUploads } = await import('./uploads.cleanup.ts');

const user = {
	id: randomUUID(),
	email: `p7-resilience-${Date.now()}@kinko.test`,
	name: 'P7 Resilience',
};

function asLoggedIn() {
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

describe('Large-File, Interrupted-Upload & Rate-Limit Resilience (#75, #76, #77)', () => {
	let tenantId = '';

	beforeEach(() => {
		vi.clearAllMocks();
		resetRateLimiters();
	});

	afterEach(() => {
		resetRateLimiters();
	});

	afterAll(async () => {
		await prisma.tenant.deleteMany({ where: { ownerId: user.id } });
		await prisma.userProfile.deleteMany({ where: { id: user.id } });
		await prisma.$disconnect();
	});

	it('rejects oversized uploads & oversized request bodies and leaves zero orphaned File rows (#75, #77)', async () => {
		asLoggedIn();
		const tRes = await app.request('/api/v1/tenants');
		tenantId = ((await tRes.json()) as { payload: { tenants: Array<{ id: string }> } }).payload.tenants[0]?.id ?? '';

		const oversized = getMaxFileSizeBytes() + 1;

		const singleRes = await app.request('/api/v1/uploads', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
			body: JSON.stringify({
				fileName: 'too-big.bin',
				mimeType: 'application/octet-stream',
				sizeBytes: oversized,
			}),
		});
		expect(singleRes.status).toBe(413);

		const multiRes = await app.request('/api/v1/uploads/multipart', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
			body: JSON.stringify({
				fileName: 'too-big-multi.bin',
				mimeType: 'application/octet-stream',
				sizeBytes: oversized,
			}),
		});
		expect(multiRes.status).toBe(413);

		// Oversized JSON body (> 1 MiB) rejected before processing
		const hugePayload = JSON.stringify({ padding: 'a'.repeat(1_100_000) });
		const bigBodyRes = await app.request('/api/v1/folders', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': String(Buffer.byteLength(hugePayload)),
				'X-Tenant-Id': tenantId,
			},
			body: hugePayload,
		});
		expect(bigBodyRes.status).toBe(413);

		const fileCount = await prisma.file.count({ where: { tenantId } });
		expect(fileCount).toBe(0);
	});

	it('handles interrupted single & multipart uploads without leaving File metadata or orphaned S3 parts (#75)', async () => {
		asLoggedIn();

		// 1. Completing before uploading object returns 400 and creates no File
		const intentRes = await app.request('/api/v1/uploads', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
			body: JSON.stringify({
				fileName: 'never-uploaded.txt',
				mimeType: 'text/plain',
				sizeBytes: 64,
			}),
		});
		expect(intentRes.status).toBe(201);
		const intentId = ((await intentRes.json()) as { payload: { upload: { id: string } } }).payload.upload.id;

		const prematureComplete = await app.request(`/api/v1/uploads/${intentId}/complete`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
			body: JSON.stringify({}),
		});
		expect(prematureComplete.status).toBe(400);

		const abortRes = await app.request(`/api/v1/uploads/${intentId}`, {
			method: 'DELETE',
			headers: { 'X-Tenant-Id': tenantId },
		});
		expect(abortRes.status).toBe(200);

		// 2. Initiate multipart upload, upload only part 1, expire it, and run cleanupExpiredUploads
		const partSize = 5 * 1024 * 1024;
		const initRes = await app.request('/api/v1/uploads/multipart', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
			body: JSON.stringify({
				fileName: 'interrupted-multi.bin',
				mimeType: 'application/octet-stream',
				sizeBytes: partSize + 512,
				partSizeBytes: partSize,
			}),
		});
		expect(initRes.status).toBe(201);
		const multiId = ((await initRes.json()) as { payload: { upload: { id: string } } }).payload.upload.id;

		await prisma.upload.update({
			where: { id: multiId },
			data: { expiresAt: new Date(Date.now() - 60_000) },
		});

		const cleanup = await cleanupExpiredUploads({ tenantId });
		expect(cleanup.expiredCount).toBeGreaterThanOrEqual(1);
		expect(cleanup.cleanedMultipartCount).toBeGreaterThanOrEqual(1);

		const updatedUpload = await prisma.upload.findUnique({ where: { id: multiId } });
		expect(updatedUpload?.status).toBe('EXPIRED');

		const fileCount = await prisma.file.count({ where: { tenantId } });
		expect(fileCount).toBe(0);
	}, 20_000);

	it('rate-limits excessive requests on sensitive public share endpoint (#76)', async () => {
		asLoggedIn();
		let saw429 = false;
		for (let i = 0; i < 45; i++) {
			const res = await app.request(
				'/api/v1/shares/public/nonexistent-rate-limit-token-12345',
			);
			if (res.status === 429) {
				saw429 = true;
				break;
			}
			expect(res.status).toBe(404);
		}
		expect(saw429).toBe(true);
		expect(env.NODE_ENV).toBeDefined();
	}, 20_000);
});
