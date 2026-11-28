import type {
	Tenant,
	TenantAnalytics,
	TenantMember,
	UserProfile,
} from '../generated/prisma/client.js';

export interface TenantDTO {
	id: string;
	name: string;
	ownerId: string | null;
	storageQuotaBytes: number;
	createdAt: string;
	updatedAt: string;
}

export interface TenantAnalyticsDTO {
	storageUsedBytes: number;
	totalFiles: number;
	totalFolders: number;
	totalUploads: number;
	totalDownloads: number;
}

export interface TenantWithMembershipDTO extends TenantDTO {
	role: TenantMember['role'];
	analytics: TenantAnalyticsDTO | null;
}

export interface UserProfileDTO {
	id: string;
	onboardingComplete: boolean;
	defaultTenantId: string | null;
	createdAt: string;
	updatedAt: string;
}

export function serializeTenant(tenant: Tenant): TenantDTO {
	return {
		id: tenant.id,
		name: tenant.name,
		ownerId: tenant.ownerId,
		storageQuotaBytes: Number(tenant.storageQuotaBytes),
		createdAt: tenant.createdAt.toISOString(),
		updatedAt: tenant.updatedAt.toISOString(),
	};
}

export function serializeTenantAnalytics(
	analytics: TenantAnalytics | null | undefined,
): TenantAnalyticsDTO | null {
	if (!analytics) return null;
	return {
		storageUsedBytes: Number(analytics.storageUsedBytes),
		totalFiles: analytics.totalFiles,
		totalFolders: analytics.totalFolders,
		totalUploads: Number(analytics.totalUploads),
		totalDownloads: Number(analytics.totalDownloads),
	};
}

export function serializeUserProfile(profile: UserProfile): UserProfileDTO {
	return {
		id: profile.id,
		onboardingComplete: profile.onboardingComplete,
		defaultTenantId: profile.defaultTenantId,
		createdAt: profile.createdAt.toISOString(),
		updatedAt: profile.updatedAt.toISOString(),
	};
}
