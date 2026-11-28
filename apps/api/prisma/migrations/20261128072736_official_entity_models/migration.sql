/*
  Warnings:

  - Added the required column `updatedAt` to the `tenant_members` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'ABORTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "FilePermissionRole" AS ENUM ('VIEWER', 'EDITOR', 'OWNER');

-- CreateEnum
CREATE TYPE "FavoriteTargetType" AS ENUM ('FILE', 'FOLDER');

-- CreateEnum
CREATE TYPE "ActivityAction" AS ENUM ('FILE_UPLOADED', 'FILE_DOWNLOADED', 'FILE_RENAMED', 'FILE_MOVED', 'FILE_DELETED', 'FILE_RESTORED', 'FILE_PERMANENTLY_DELETED', 'FILE_SHARED', 'FILE_SHARE_REVOKED', 'FILE_PERMISSION_UPDATED', 'FILE_VERSION_CREATED', 'FOLDER_CREATED', 'FOLDER_RENAMED', 'FOLDER_MOVED', 'FOLDER_DELETED', 'FOLDER_RESTORED', 'FOLDER_PERMANENTLY_DELETED', 'MEMBER_ADDED', 'MEMBER_ROLE_UPDATED', 'MEMBER_REMOVED');

-- CreateEnum
CREATE TYPE "ActivityTargetType" AS ENUM ('FILE', 'FOLDER', 'TENANT', 'SHARE', 'MEMBER');

-- AlterTable
ALTER TABLE "files" ADD COLUMN     "checksumSha256" TEXT,
ADD COLUMN     "currentVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "tenant_members" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "storageQuotaBytes" BIGINT NOT NULL DEFAULT 1073741824;

-- CreateTable
CREATE TABLE "file_versions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "checksumSha256" TEXT,
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploads" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "folderId" UUID,
    "fileId" UUID,
    "uploadedById" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "declaredSizeBytes" BIGINT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'PENDING',
    "isMultipart" BOOLEAN NOT NULL DEFAULT false,
    "s3UploadId" TEXT,
    "partSizeBytes" INTEGER,
    "totalParts" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_parts" (
    "id" UUID NOT NULL,
    "uploadId" UUID NOT NULL,
    "partNumber" INTEGER NOT NULL,
    "eTag" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_shares" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "createdById" UUID,
    "tokenHash" TEXT NOT NULL,
    "passwordHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "file_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_permissions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "FilePermissionRole" NOT NULL DEFAULT 'VIEWER',
    "grantedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "file_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "targetType" "FavoriteTargetType" NOT NULL,
    "fileId" UUID,
    "folderId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "actorId" UUID,
    "action" "ActivityAction" NOT NULL,
    "targetType" "ActivityTargetType" NOT NULL,
    "fileId" UUID,
    "folderId" UUID,
    "targetName" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_analytics" (
    "tenantId" UUID NOT NULL,
    "storageUsedBytes" BIGINT NOT NULL DEFAULT 0,
    "totalFiles" INTEGER NOT NULL DEFAULT 0,
    "totalFolders" INTEGER NOT NULL DEFAULT 0,
    "totalUploads" BIGINT NOT NULL DEFAULT 0,
    "totalDownloads" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_analytics_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "storage_usage_snapshots" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "storageUsedBytes" BIGINT NOT NULL,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "folderCount" INTEGER NOT NULL DEFAULT 0,
    "uploadCount" INTEGER NOT NULL DEFAULT 0,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage_usage_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "file_versions_objectKey_key" ON "file_versions"("objectKey");

-- CreateIndex
CREATE INDEX "file_versions_tenantId_fileId_idx" ON "file_versions"("tenantId", "fileId");

-- CreateIndex
CREATE INDEX "file_versions_uploadedById_idx" ON "file_versions"("uploadedById");

-- CreateIndex
CREATE UNIQUE INDEX "file_versions_fileId_versionNumber_key" ON "file_versions"("fileId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "uploads_objectKey_key" ON "uploads"("objectKey");

-- CreateIndex
CREATE INDEX "uploads_tenantId_status_idx" ON "uploads"("tenantId", "status");

-- CreateIndex
CREATE INDEX "uploads_status_expiresAt_idx" ON "uploads"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "uploads_uploadedById_idx" ON "uploads"("uploadedById");

-- CreateIndex
CREATE INDEX "uploads_fileId_idx" ON "uploads"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "upload_parts_uploadId_partNumber_key" ON "upload_parts"("uploadId", "partNumber");

-- CreateIndex
CREATE UNIQUE INDEX "file_shares_tokenHash_key" ON "file_shares"("tokenHash");

-- CreateIndex
CREATE INDEX "file_shares_tenantId_fileId_idx" ON "file_shares"("tenantId", "fileId");

-- CreateIndex
CREATE INDEX "file_shares_expiresAt_idx" ON "file_shares"("expiresAt");

-- CreateIndex
CREATE INDEX "file_shares_createdById_idx" ON "file_shares"("createdById");

-- CreateIndex
CREATE INDEX "file_permissions_tenantId_userId_idx" ON "file_permissions"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "file_permissions_grantedById_idx" ON "file_permissions"("grantedById");

-- CreateIndex
CREATE UNIQUE INDEX "file_permissions_fileId_userId_key" ON "file_permissions"("fileId", "userId");

-- CreateIndex
CREATE INDEX "favorites_tenantId_userId_createdAt_idx" ON "favorites"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_tenantId_userId_fileId_key" ON "favorites"("tenantId", "userId", "fileId");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_tenantId_userId_folderId_key" ON "favorites"("tenantId", "userId", "folderId");

-- CreateIndex
CREATE INDEX "activities_tenantId_createdAt_idx" ON "activities"("tenantId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "activities_tenantId_action_createdAt_idx" ON "activities"("tenantId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "activities_actorId_idx" ON "activities"("actorId");

-- CreateIndex
CREATE INDEX "activities_fileId_idx" ON "activities"("fileId");

-- CreateIndex
CREATE INDEX "activities_folderId_idx" ON "activities"("folderId");

-- CreateIndex
CREATE INDEX "storage_usage_snapshots_tenantId_snapshotDate_idx" ON "storage_usage_snapshots"("tenantId", "snapshotDate" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "storage_usage_snapshots_tenantId_snapshotDate_key" ON "storage_usage_snapshots"("tenantId", "snapshotDate");

-- CreateIndex
CREATE INDEX "files_tenantId_deletedAt_idx" ON "files"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "files_tenantId_checksumSha256_idx" ON "files"("tenantId", "checksumSha256");

-- CreateIndex
CREATE INDEX "files_tenantId_mimeType_idx" ON "files"("tenantId", "mimeType");

-- CreateIndex
CREATE INDEX "files_tenantId_createdAt_idx" ON "files"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "files_uploadedById_idx" ON "files"("uploadedById");

-- CreateIndex
CREATE INDEX "folders_tenantId_deletedAt_idx" ON "folders"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "folders_createdById_idx" ON "folders"("createdById");

-- CreateIndex
CREATE INDEX "tenants_ownerId_idx" ON "tenants"("ownerId");

-- CreateIndex
CREATE INDEX "user_profiles_defaultTenantId_idx" ON "user_profiles"("defaultTenantId");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_defaultTenantId_fkey" FOREIGN KEY ("defaultTenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_parentFolderId_fkey" FOREIGN KEY ("parentFolderId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_parts" ADD CONSTRAINT "upload_parts_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_shares" ADD CONSTRAINT "file_shares_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_shares" ADD CONSTRAINT "file_shares_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_shares" ADD CONSTRAINT "file_shares_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_permissions" ADD CONSTRAINT "file_permissions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_permissions" ADD CONSTRAINT "file_permissions_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_permissions" ADD CONSTRAINT "file_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_permissions" ADD CONSTRAINT "file_permissions_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "user_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_analytics" ADD CONSTRAINT "tenant_analytics_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_usage_snapshots" ADD CONSTRAINT "storage_usage_snapshots_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
