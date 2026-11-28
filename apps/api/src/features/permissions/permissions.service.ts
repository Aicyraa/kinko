import { HTTPException } from 'hono/http-exception';
import type {
	File,
	FilePermissionRole,
	TenantMember,
} from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.ts';

const ROLE_RANK: Record<FilePermissionRole, number> = {
	VIEWER: 1,
	EDITOR: 2,
	OWNER: 3,
};

export interface FilePermissionDTO {
	id: string;
	tenantId: string;
	fileId: string;
	userId: string;
	role: FilePermissionRole;
	grantedById: string | null;
	userName: string | null;
	userEmail: string | null;
	createdAt: string;
	updatedAt: string;
}

export async function lookupAuthUsers(
	userIds: string[],
): Promise<Map<string, { name: string | null; email: string | null }>> {
	const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
	const map = new Map<string, { name: string | null; email: string | null }>();
	if (uniqueIds.length === 0) return map;

	const rows = await prisma.$queryRaw<
		Array<{ id: string; name: string | null; email: string | null }>
	>`
		SELECT id::text, name, email
		FROM neon_auth."user"
		WHERE id::text = ANY(${uniqueIds}::text[])
	`;
	for (const row of rows) {
		map.set(row.id, { name: row.name, email: row.email });
	}
	return map;
}

export async function resolveEffectiveFileRole(
	tenantMembership: Pick<TenantMember, 'role'>,
	file: Pick<File, 'id' | 'uploadedById'>,
	userId: string,
): Promise<FilePermissionRole | null> {
	if (
		tenantMembership.role === 'OWNER' ||
		tenantMembership.role === 'ADMIN'
	) {
		return 'OWNER';
	}
	if (file.uploadedById === userId) {
		return 'OWNER';
	}

	const explicit = await prisma.filePermission.findUnique({
		where: { fileId_userId: { fileId: file.id, userId } },
		select: { role: true },
	});
	if (explicit) {
		return explicit.role;
	}

	const explicitCount = await prisma.filePermission.count({
		where: { fileId: file.id },
	});
	// Files with explicit ACLs deny unlisted MEMBERs; unrestricted files default to EDITOR.
	return explicitCount > 0 ? null : 'EDITOR';
}

export async function assertFileAccess(
	tenantMembership: Pick<TenantMember, 'role'>,
	file: Pick<File, 'id' | 'uploadedById'>,
	userId: string,
	requiredRole: FilePermissionRole,
): Promise<FilePermissionRole> {
	const effective = await resolveEffectiveFileRole(
		tenantMembership,
		file,
		userId,
	);
	if (!effective || ROLE_RANK[effective] < ROLE_RANK[requiredRole]) {
		throw new HTTPException(403, {
			message: 'Insufficient file permissions',
		});
	}
	return effective;
}

export async function listFilePermissions(
	tenantId: string,
	tenantMembership: Pick<TenantMember, 'role'>,
	userId: string,
	fileId: string,
): Promise<{
	fileId: string;
	effectiveRole: FilePermissionRole;
	permissions: FilePermissionDTO[];
}> {
	const file = await prisma.file.findFirst({
		where: { id: fileId, tenantId, deletedAt: null },
	});
	if (!file) {
		throw new HTTPException(404, { message: 'File not found' });
	}

	const effectiveRole = await assertFileAccess(
		tenantMembership,
		file,
		userId,
		'VIEWER',
	);

	const rows = await prisma.filePermission.findMany({
		where: { tenantId, fileId },
		orderBy: { createdAt: 'asc' },
	});

	const users = await lookupAuthUsers(rows.map((r) => r.userId));

	return {
		fileId,
		effectiveRole,
		permissions: rows.map((row) => {
			const info = users.get(row.userId);
			return {
				id: row.id,
				tenantId: row.tenantId,
				fileId: row.fileId,
				userId: row.userId,
				role: row.role,
				grantedById: row.grantedById,
				userName: info?.name ?? null,
				userEmail: info?.email ?? null,
				createdAt: row.createdAt.toISOString(),
				updatedAt: row.updatedAt.toISOString(),
			};
		}),
	};
}

export async function upsertFilePermission(
	tenantId: string,
	tenantMembership: Pick<TenantMember, 'role'>,
	actorId: string,
	fileId: string,
	targetUserId: string,
	role: FilePermissionRole,
): Promise<FilePermissionDTO> {
	const file = await prisma.file.findFirst({
		where: { id: fileId, tenantId, deletedAt: null },
	});
	if (!file) {
		throw new HTTPException(404, { message: 'File not found' });
	}

	await assertFileAccess(tenantMembership, file, actorId, 'OWNER');

	const member = await prisma.tenantMember.findUnique({
		where: { tenantId_userId: { tenantId, userId: targetUserId } },
	});
	if (!member) {
		throw new HTTPException(404, {
			message: 'Target user is not a member of this workspace',
		});
	}

	const permission = await prisma.$transaction(async (tx) => {
		const upserted = await tx.filePermission.upsert({
			where: { fileId_userId: { fileId, userId: targetUserId } },
			create: {
				tenantId,
				fileId,
				userId: targetUserId,
				role,
				grantedById: actorId,
			},
			update: {
				role,
				grantedById: actorId,
			},
		});

		await tx.activity.create({
			data: {
				tenantId,
				actorId,
				action: 'FILE_PERMISSION_UPDATED',
				targetType: 'FILE',
				fileId: file.id,
				targetName: file.name,
				metadata: { targetUserId, role },
			},
		});

		return upserted;
	});

	const users = await lookupAuthUsers([targetUserId]);
	const info = users.get(targetUserId);

	return {
		id: permission.id,
		tenantId: permission.tenantId,
		fileId: permission.fileId,
		userId: permission.userId,
		role: permission.role,
		grantedById: permission.grantedById,
		userName: info?.name ?? null,
		userEmail: info?.email ?? null,
		createdAt: permission.createdAt.toISOString(),
		updatedAt: permission.updatedAt.toISOString(),
	};
}

export async function removeFilePermission(
	tenantId: string,
	tenantMembership: Pick<TenantMember, 'role'>,
	actorId: string,
	fileId: string,
	targetUserId: string,
): Promise<{ removed: true }> {
	const file = await prisma.file.findFirst({
		where: { id: fileId, tenantId, deletedAt: null },
	});
	if (!file) {
		throw new HTTPException(404, { message: 'File not found' });
	}

	await assertFileAccess(tenantMembership, file, actorId, 'OWNER');

	const existing = await prisma.filePermission.findUnique({
		where: { fileId_userId: { fileId, userId: targetUserId } },
	});
	if (!existing) {
		throw new HTTPException(404, { message: 'Permission not found' });
	}

	await prisma.$transaction(async (tx) => {
		await tx.filePermission.delete({
			where: { id: existing.id },
		});

		await tx.activity.create({
			data: {
				tenantId,
				actorId,
				action: 'FILE_PERMISSION_UPDATED',
				targetType: 'FILE',
				fileId: file.id,
				targetName: file.name,
				metadata: { targetUserId, removed: true },
			},
		});
	});

	return { removed: true };
}
