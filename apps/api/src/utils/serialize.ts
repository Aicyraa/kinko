import type {
	File,
	FileVersion,
	Folder,
	Tenant,
	TenantAnalytics,
	TenantMember,
	Upload,
	UploadPart,
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

export interface FolderDTO {
	id: string;
	tenantId: string;
	parentFolderId: string | null;
	name: string;
	createdById: string;
	createdAt: string;
	updatedAt: string;
	deletedAt: string | null;
}

export interface FileDTO {
	id: string;
	tenantId: string;
	folderId: string | null;
	uploadedById: string;
	name: string;
	mimeType: string;
	sizeBytes: number;
	checksumSha256: string | null;
	currentVersion: number;
	createdAt: string;
	updatedAt: string;
	deletedAt: string | null;
}

export interface UploadDTO {
	id: string;
	tenantId: string;
	folderId: string | null;
	fileId: string | null;
	uploadedById: string;
	fileName: string;
	mimeType: string;
	declaredSizeBytes: number;
	status: Upload['status'];
	isMultipart: boolean;
	partSizeBytes: number | null;
	totalParts: number | null;
	expiresAt: string;
	completedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface UploadPartDTO {
	id: string;
	uploadId: string;
	partNumber: number;
	eTag: string;
	sizeBytes: number;
	createdAt: string;
}

export interface FileVersionDTO {
	id: string;
	tenantId: string;
	fileId: string;
	versionNumber: number;
	mimeType: string;
	sizeBytes: number;
	checksumSha256: string | null;
	uploadedById: string;
	createdAt: string;
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

export function serializeFolder(folder: Folder): FolderDTO {
	return {
		id: folder.id,
		tenantId: folder.tenantId,
		parentFolderId: folder.parentFolderId,
		name: folder.name,
		createdById: folder.createdById,
		createdAt: folder.createdAt.toISOString(),
		updatedAt: folder.updatedAt.toISOString(),
		deletedAt: folder.deletedAt ? folder.deletedAt.toISOString() : null,
	};
}

export function serializeFile(file: File): FileDTO {
	return {
		id: file.id,
		tenantId: file.tenantId,
		folderId: file.folderId,
		uploadedById: file.uploadedById,
		name: file.name,
		mimeType: file.mimeType,
		sizeBytes: Number(file.sizeBytes),
		checksumSha256: file.checksumSha256,
		currentVersion: file.currentVersion,
		createdAt: file.createdAt.toISOString(),
		updatedAt: file.updatedAt.toISOString(),
		deletedAt: file.deletedAt ? file.deletedAt.toISOString() : null,
	};
}

export function serializeUpload(upload: Upload): UploadDTO {
	return {
		id: upload.id,
		tenantId: upload.tenantId,
		folderId: upload.folderId,
		fileId: upload.fileId,
		uploadedById: upload.uploadedById,
		fileName: upload.fileName,
		mimeType: upload.mimeType,
		declaredSizeBytes: Number(upload.declaredSizeBytes),
		status: upload.status,
		isMultipart: upload.isMultipart,
		partSizeBytes: upload.partSizeBytes,
		totalParts: upload.totalParts,
		expiresAt: upload.expiresAt.toISOString(),
		completedAt: upload.completedAt ? upload.completedAt.toISOString() : null,
		createdAt: upload.createdAt.toISOString(),
		updatedAt: upload.updatedAt.toISOString(),
	};
}

export function serializeUploadPart(part: UploadPart): UploadPartDTO {
	return {
		id: part.id,
		uploadId: part.uploadId,
		partNumber: part.partNumber,
		eTag: part.eTag,
		sizeBytes: Number(part.sizeBytes),
		createdAt: part.createdAt.toISOString(),
	};
}

export function serializeFileVersion(version: FileVersion): FileVersionDTO {
	return {
		id: version.id,
		tenantId: version.tenantId,
		fileId: version.fileId,
		versionNumber: version.versionNumber,
		mimeType: version.mimeType,
		sizeBytes: Number(version.sizeBytes),
		checksumSha256: version.checksumSha256,
		uploadedById: version.uploadedById,
		createdAt: version.createdAt.toISOString(),
	};
}
