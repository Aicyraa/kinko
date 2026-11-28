import {
	createHash,
	randomBytes,
	scryptSync,
	timingSafeEqual,
} from 'node:crypto';
import { HTTPException } from 'hono/http-exception';
import type { FileShare, TenantMember } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.ts';
import { createPresignedDownloadUrl } from '../../lib/storage.ts';
import { assertFileAccess } from '../permissions/permissions.service.ts';

export interface FileShareDTO {
	id: string;
	fileId: string;
	hasPassword: boolean;
	expiresAt: string | null;
	revokedAt: string | null;
	downloadCount: number;
	status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
	createdAt: string;
}

export function generateShareToken(): string {
	return randomBytes(32).toString('base64url');
}

export function hashShareToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export function hashSharePassword(password: string): string {
	const salt = randomBytes(16).toString('hex');
	const derived = scryptSync(password, salt, 64).toString('hex');
	return `${salt}:${derived}`;
}

export function verifySharePassword(
	password: string,
	storedHash: string,
): boolean {
	const [salt, keyHex] = storedHash.split(':');
	if (!salt || !keyHex) return false;
	const expected = Buffer.from(keyHex, 'hex');
	const actual = scryptSync(password, salt, 64);
	if (expected.length !== actual.length) return false;
	return timingSafeEqual(expected, actual);
}

function serializeFileShare(share: FileShare): FileShareDTO {
	const now = Date.now();
	let status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' = 'ACTIVE';
	if (share.revokedAt) {
		status = 'REVOKED';
	} else if (share.expiresAt && share.expiresAt.getTime() <= now) {
		status = 'EXPIRED';
	}
	return {
		id: share.id,
		fileId: share.fileId,
		hasPassword: Boolean(share.passwordHash),
		expiresAt: share.expiresAt ? share.expiresAt.toISOString() : null,
		revokedAt: share.revokedAt ? share.revokedAt.toISOString() : null,
		downloadCount: share.downloadCount,
		status,
		createdAt: share.createdAt.toISOString(),
	};
}

export async function listFileShares(
	tenantId: string,
	tenantMembership: Pick<TenantMember, 'role'>,
	userId: string,
	fileId: string,
): Promise<{ shares: FileShareDTO[] }> {
	const file = await prisma.file.findFirst({
		where: { id: fileId, tenantId, deletedAt: null },
	});
	if (!file) {
		throw new HTTPException(404, { message: 'File not found' });
	}
	await assertFileAccess(tenantMembership, file, userId, 'OWNER');

	const rows = await prisma.fileShare.findMany({
		where: { tenantId, fileId },
		orderBy: { createdAt: 'desc' },
	});

	return { shares: rows.map(serializeFileShare) };
}

export async function createFileShare(
	tenantId: string,
	tenantMembership: Pick<TenantMember, 'role'>,
	userId: string,
	input: {
		fileId: string;
		password?: string;
		expiresInHours?: number | null;
	},
): Promise<{
	share: FileShareDTO;
	token: string;
	sharePath: string;
}> {
	const file = await prisma.file.findFirst({
		where: { id: input.fileId, tenantId, deletedAt: null },
	});
	if (!file) {
		throw new HTTPException(404, { message: 'File not found' });
	}
	await assertFileAccess(tenantMembership, file, userId, 'OWNER');

	const token = generateShareToken();
	const tokenHash = hashShareToken(token);
	const passwordHash = input.password
		? hashSharePassword(input.password)
		: null;
	const expiresAt =
		input.expiresInHours != null
			? new Date(Date.now() + input.expiresInHours * 3_600_000)
			: null;

	const share = await prisma.$transaction(async (tx) => {
		const created = await tx.fileShare.create({
			data: {
				tenantId,
				fileId: file.id,
				createdById: userId,
				tokenHash,
				passwordHash,
				expiresAt,
			},
		});

		await tx.activity.create({
			data: {
				tenantId,
				actorId: userId,
				action: 'FILE_SHARED',
				targetType: 'SHARE',
				fileId: file.id,
				targetName: file.name,
				metadata: {
					shareId: created.id,
					hasPassword: Boolean(passwordHash),
					expiresAt: expiresAt ? expiresAt.toISOString() : null,
				},
			},
		});

		return created;
	});

	return {
		share: serializeFileShare(share),
		token,
		sharePath: `/s/${token}`,
	};
}

export async function revokeFileShare(
	tenantId: string,
	tenantMembership: Pick<TenantMember, 'role'>,
	userId: string,
	shareId: string,
): Promise<{ share: FileShareDTO }> {
	const existing = await prisma.fileShare.findFirst({
		where: { id: shareId, tenantId },
		include: { file: true },
	});
	if (!existing) {
		throw new HTTPException(404, { message: 'Share link not found' });
	}
	await assertFileAccess(tenantMembership, existing.file, userId, 'OWNER');

	if (existing.revokedAt) {
		return { share: serializeFileShare(existing) };
	}

	const updated = await prisma.$transaction(async (tx) => {
		const revoked = await tx.fileShare.update({
			where: { id: existing.id },
			data: { revokedAt: new Date() },
		});

		await tx.activity.create({
			data: {
				tenantId,
				actorId: userId,
				action: 'FILE_SHARE_REVOKED',
				targetType: 'SHARE',
				fileId: existing.fileId,
				targetName: existing.file.name,
				metadata: { shareId: existing.id },
			},
		});

		return revoked;
	});

	return { share: serializeFileShare(updated) };
}

async function resolveActivePublicShare(token: string) {
	const tokenHash = hashShareToken(token);
	const share = await prisma.fileShare.findUnique({
		where: { tokenHash },
		include: { file: true },
	});
	if (!share) {
		throw new HTTPException(404, { message: 'Share link not found' });
	}
	if (share.revokedAt) {
		throw new HTTPException(410, { message: 'Share link has been revoked' });
	}
	if (share.expiresAt && share.expiresAt <= new Date()) {
		throw new HTTPException(410, { message: 'Share link has expired' });
	}
	if (share.file.deletedAt) {
		throw new HTTPException(410, {
			message: 'Shared file is no longer available',
		});
	}
	return share;
}

export async function getPublicShareMetadata(token: string) {
	const share = await resolveActivePublicShare(token);
	return {
		share: {
			id: share.id,
			requiresPassword: Boolean(share.passwordHash),
			expiresAt: share.expiresAt ? share.expiresAt.toISOString() : null,
			downloadCount: share.downloadCount,
		},
		file: {
			id: share.file.id,
			name: share.file.name,
			mimeType: share.file.mimeType,
			sizeBytes: Number(share.file.sizeBytes),
			updatedAt: share.file.updatedAt.toISOString(),
		},
	};
}

export async function accessPublicShare(
	token: string,
	input: { password?: string; disposition: 'attachment' | 'inline' },
) {
	const share = await resolveActivePublicShare(token);

	if (share.passwordHash) {
		if (!input.password || !verifySharePassword(input.password, share.passwordHash)) {
			throw new HTTPException(401, { message: 'Invalid share password' });
		}
	}

	const expiresInSeconds = 300;
	const downloadUrl = await createPresignedDownloadUrl({
		key: share.file.objectKey,
		fileName: share.file.name,
		disposition: input.disposition,
		expiresInSeconds,
	});

	await prisma.$transaction(async (tx) => {
		await tx.fileShare.update({
			where: { id: share.id },
			data: { downloadCount: { increment: 1 } },
		});

		await tx.tenantAnalytics.upsert({
			where: { tenantId: share.tenantId },
			create: { tenantId: share.tenantId, totalDownloads: 1n },
			update: { totalDownloads: { increment: 1 } },
		});

		await tx.activity.create({
			data: {
				tenantId: share.tenantId,
				actorId: null,
				action: 'FILE_DOWNLOADED',
				targetType: 'SHARE',
				fileId: share.file.id,
				targetName: share.file.name,
				metadata: { viaShare: true, shareId: share.id },
			},
		});
	});

	return {
		downloadUrl,
		expiresInSeconds,
		file: {
			id: share.file.id,
			name: share.file.name,
			mimeType: share.file.mimeType,
			sizeBytes: Number(share.file.sizeBytes),
		},
	};
}
