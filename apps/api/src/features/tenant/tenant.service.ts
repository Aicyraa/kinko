import { Prisma, type TenantRole } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.ts';
import type { AuthUser } from '../../types.ts';
import {
	serializeTenant,
	serializeTenantAnalytics,
	serializeUserProfile,
	type TenantWithMembershipDTO,
	type UserProfileDTO,
} from '../../utils/serialize.ts';

const DEFAULT_QUOTA_BYTES = 1_073_741_824n; // 1 GiB

function deriveWorkspaceName(user: Pick<AuthUser, 'name' | 'email'>): string {
	const base = user.name?.trim() || user.email.split('@')[0]?.trim() || 'Personal';
	return `${base}'s Vault`;
}

/**
 * Idempotently provisions a `UserProfile`, a default `Tenant`, an `OWNER`
 * `TenantMember` row, and a `TenantAnalytics` row on the user's first
 * authenticated request. Safe under concurrent requests.
 */
export async function ensureUserOnboarded(user: Pick<AuthUser, 'id' | 'name' | 'email'>) {
	const existing = await prisma.userProfile.findUnique({
		where: { id: user.id },
		include: {
			memberships: {
				include: {
					tenant: {
						include: { analytics: true },
					},
				},
				orderBy: { createdAt: 'asc' },
			},
		},
	});

	if (
		existing?.onboardingComplete &&
		existing.defaultTenantId &&
		existing.memberships.length > 0
	) {
		return existing;
	}

	try {
		return await prisma.$transaction(async (tx) => {
			const profile = await tx.userProfile.findUnique({
				where: { id: user.id },
				include: {
					memberships: {
						include: {
							tenant: {
								include: { analytics: true },
							},
						},
						orderBy: { createdAt: 'asc' },
					},
				},
			});

			if (!profile) {
				await tx.userProfile.create({
					data: { id: user.id },
				});
			}

			const existingMembership = profile?.memberships[0];
			if (existingMembership) {
				const defaultTenantId =
					profile?.defaultTenantId ?? existingMembership.tenantId;

				return tx.userProfile.update({
					where: { id: user.id },
					data: {
						defaultTenantId,
						onboardingComplete: true,
					},
					include: {
						memberships: {
							include: {
								tenant: {
									include: { analytics: true },
								},
							},
							orderBy: { createdAt: 'asc' },
						},
					},
				});
			}

			const tenant = await tx.tenant.create({
				data: {
					name: deriveWorkspaceName(user),
					ownerId: user.id,
					storageQuotaBytes: DEFAULT_QUOTA_BYTES,
					members: {
						create: {
							userId: user.id,
							role: 'OWNER',
						},
					},
					analytics: {
						create: {},
					},
				},
			});

			return tx.userProfile.update({
				where: { id: user.id },
				data: {
					defaultTenantId: tenant.id,
					onboardingComplete: true,
				},
				include: {
					memberships: {
						include: {
							tenant: {
								include: { analytics: true },
							},
						},
						orderBy: { createdAt: 'asc' },
					},
				},
			});
		});
	} catch (err) {
		// Handle rare concurrent first-request race on UserProfile PK
		if (
			err instanceof Prisma.PrismaClientKnownRequestError &&
			err.code === 'P2002'
		) {
			const retried = await prisma.userProfile.findUnique({
				where: { id: user.id },
				include: {
					memberships: {
						include: {
							tenant: {
								include: { analytics: true },
							},
						},
						orderBy: { createdAt: 'asc' },
					},
				},
			});
			if (retried) return retried;
		}
		throw err;
	}
}

export function serializeOnboardedState(
	profile: Awaited<ReturnType<typeof ensureUserOnboarded>>,
): {
	profile: UserProfileDTO;
	tenants: TenantWithMembershipDTO[];
} {
	return {
		profile: serializeUserProfile(profile),
		tenants: profile.memberships.map((m) => ({
			...serializeTenant(m.tenant),
			role: m.role,
			analytics: serializeTenantAnalytics(m.tenant.analytics),
		})),
	};
}

export async function listUserTenants(
	userId: string,
): Promise<TenantWithMembershipDTO[]> {
	const memberships = await prisma.tenantMember.findMany({
		where: { userId },
		include: {
			tenant: {
				include: { analytics: true },
			},
		},
		orderBy: { createdAt: 'asc' },
	});

	return memberships.map((m) => ({
		...serializeTenant(m.tenant),
		role: m.role,
		analytics: serializeTenantAnalytics(m.tenant.analytics),
	}));
}

export async function createTenant(
	userId: string,
	name: string,
): Promise<TenantWithMembershipDTO> {
	const result = await prisma.$transaction(async (tx) => {
		const tenant = await tx.tenant.create({
			data: {
				name,
				ownerId: userId,
				storageQuotaBytes: DEFAULT_QUOTA_BYTES,
				members: {
					create: {
						userId,
						role: 'OWNER',
					},
				},
				analytics: {
					create: {},
				},
			},
			include: {
				analytics: true,
				members: {
					where: { userId },
				},
			},
		});

		return tenant;
	});

	const membership = result.members[0];
	return {
		...serializeTenant(result),
		role: membership?.role ?? 'OWNER',
		analytics: serializeTenantAnalytics(result.analytics),
	};
}

export async function updateTenantName(
	tenantId: string,
	name: string,
	role: TenantRole,
): Promise<TenantWithMembershipDTO> {
	const updated = await prisma.tenant.update({
		where: { id: tenantId },
		data: { name },
		include: { analytics: true },
	});

	return {
		...serializeTenant(updated),
		role,
		analytics: serializeTenantAnalytics(updated.analytics),
	};
}

export async function setDefaultTenant(
	userId: string,
	tenantId: string,
): Promise<UserProfileDTO> {
	const updated = await prisma.userProfile.update({
		where: { id: userId },
		data: { defaultTenantId: tenantId },
	});

	return serializeUserProfile(updated);
}

export async function listTenantMembers(tenantId: string) {
	const members = await prisma.tenantMember.findMany({
		where: { tenantId },
		orderBy: { createdAt: 'asc' },
	});

	const userIds = members.map((m) => m.userId);
	const userMap = new Map<string, { name: string | null; email: string | null }>();
	if (userIds.length > 0) {
		const users = await prisma.$queryRaw<
			Array<{ id: string; name: string | null; email: string | null }>
		>`
			SELECT id::text, name, email
			FROM neon_auth."user"
			WHERE id::text = ANY(${userIds}::text[])
		`;
		for (const u of users) {
			userMap.set(u.id, { name: u.name, email: u.email });
		}
	}

	return members.map((m) => {
		const info = userMap.get(m.userId);
		return {
			id: m.id,
			tenantId: m.tenantId,
			userId: m.userId,
			role: m.role,
			name: info?.name ?? null,
			email: info?.email ?? null,
			createdAt: m.createdAt.toISOString(),
			updatedAt: m.updatedAt.toISOString(),
		};
	});
}
