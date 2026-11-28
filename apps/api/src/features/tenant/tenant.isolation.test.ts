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
	email: `user-a-${Date.now()}@kinko.test`,
	name: 'Alice Vault',
};

const userB = {
	id: randomUUID(),
	email: `user-b-${Date.now()}@kinko.test`,
	name: 'Bob Vault',
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

describe('Tenant onboarding and cross-tenant isolation (#19, #21, #22)', () => {
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

	it('returns unified 401 envelope when unauthenticated', async () => {
		asUser(null);
		const res = await app.request('/api/v1/tenants');
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body).toEqual({
			success: false,
			message: 'Unauthorized',
			code: 401,
			error: {},
		});
	});

	it('creates exactly one default tenant on first authenticated request even under concurrency (#19)', async () => {
		asUser(userA);

		const [r1, r2] = await Promise.all([
			app.request('/api/v1/tenants'),
			app.request('/api/v1/tenants'),
		]);

		expect(r1.status).toBe(200);
		expect(r2.status).toBe(200);

		const tenants = await prisma.tenant.findMany({
			where: { ownerId: userA.id },
		});
		expect(tenants).toHaveLength(1);
		expect(tenants[0]?.name).toBe("Alice Vault's Vault");

		const profile = await prisma.userProfile.findUnique({
			where: { id: userA.id },
		});
		expect(profile?.onboardingComplete).toBe(true);
		expect(profile?.defaultTenantId).toBe(tenants[0]?.id);
	});

	it('denies cross-tenant reads/writes without leaking existence (#21, #22)', async () => {
		asUser(userA);
		const resA = await app.request('/api/v1/tenants');
		const bodyA = (await resA.json()) as {
			payload: { tenants: Array<{ id: string }> };
		};
		const tenantAId = bodyA.payload.tenants[0]?.id;
		expect(tenantAId).toBeTruthy();

		// Now switch to User B
		asUser(userB);
		const resB = await app.request('/api/v1/tenants');
		expect(resB.status).toBe(200);

		const nonExistentId = randomUUID();

		const [
			crossGet,
			missingGet,
			crossPatch,
			crossMembers,
			crossHeader,
		] = await Promise.all([
			app.request(`/api/v1/tenants/${tenantAId}`),
			app.request(`/api/v1/tenants/${nonExistentId}`),
			app.request(`/api/v1/tenants/${tenantAId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Hijacked' }),
			}),
			app.request(`/api/v1/tenants/${tenantAId}/members`),
			app.request('/api/v1/tenants/not-a-uuid'),
		]);

		expect(crossGet.status).toBe(403);
		expect(missingGet.status).toBe(403);
		expect(crossPatch.status).toBe(403);
		expect(crossMembers.status).toBe(403);
		expect(crossHeader.status).toBe(403);

		// Error payload for an existing foreign tenant must be identical to a non-existent ID
		const crossJson = await crossGet.json();
		const missingJson = await missingGet.json();
		expect(crossJson).toEqual(missingJson);
	});
});
