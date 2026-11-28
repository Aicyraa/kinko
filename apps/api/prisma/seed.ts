import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { env } from '../src/env.ts';
import { prisma } from '../src/lib/prisma.ts';
import { generateObjectKey, putStorageObject } from '../src/lib/storage.ts';

const DEMO_EMAIL = 'demo@kinko.app';
const DEMO_PASSWORD = 'KinkoVault#2026';
const DEMO_NAME = 'Kinko Demo';
const PRIMARY_EMAIL = 'jeecoding09@gmail.com';

function sha256(buf: Buffer): string {
	return createHash('sha256').update(buf).digest('hex');
}

function crc32(buf: Buffer): number {
	let crc = 0xffffffff;
	for (const byte of buf) {
		crc ^= byte;
		for (let i = 0; i < 8; i++) {
			crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
		}
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
	const typeBuf = Buffer.from(type, 'ascii');
	const lenBuf = Buffer.alloc(4);
	lenBuf.writeUInt32BE(data.length, 0);
	const crcInput = Buffer.concat([typeBuf, data]);
	const crcBuf = Buffer.alloc(4);
	crcBuf.writeUInt32BE(crc32(crcInput), 0);
	return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function createMonochromePng(width = 128, height = 128): Buffer {
	const raw = Buffer.alloc(height * (1 + width * 4));
	for (let y = 0; y < height; y++) {
		const rowOffset = y * (1 + width * 4);
		raw[rowOffset] = 0; // filter None
		for (let x = 0; x < width; x++) {
			const px = rowOffset + 1 + x * 4;
			const isGrid = x % 16 === 0 || y % 16 === 0;
			const isCenter =
				x >= 40 && x <= 88 && y >= 40 && y <= 88 && (x < 44 || x > 84 || y < 44 || y > 84);
			if (isCenter) {
				raw[px] = 0x11;
				raw[px + 1] = 0x11;
				raw[px + 2] = 0x13;
				raw[px + 3] = 0xff;
			} else if (isGrid) {
				raw[px] = 0xe6;
				raw[px + 1] = 0xe6;
				raw[px + 2] = 0xea;
				raw[px + 3] = 0xff;
			} else {
				raw[px] = 0xff;
				raw[px + 1] = 0xff;
				raw[px + 2] = 0xff;
				raw[px + 3] = 0xff;
			}
		}
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // RGBA
	ihdr[10] = 0;
	ihdr[11] = 0;
	ihdr[12] = 0;

	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		pngChunk('IHDR', ihdr),
		pngChunk('IDAT', deflateSync(raw)),
		pngChunk('IEND', Buffer.alloc(0)),
	]);
}

function createSimplePdf(title: string, subtitle: string): Buffer {
	const streamText = `BT /F1 18 Tf 72 720 Td (${title}) Tj 0 -28 Td /F1 11 Tf (${subtitle}) Tj ET`;
	const objects = [
		'1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
		'2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
		'3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n',
		`4 0 obj << /Length ${Buffer.byteLength(streamText)} >> stream\n${streamText}\nendstream endobj\n`,
		'5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
	];
	let body = '%PDF-1.4\n';
	const offsets: number[] = [0];
	for (const obj of objects) {
		offsets.push(Buffer.byteLength(body));
		body += obj;
	}
	const xrefOffset = Buffer.byteLength(body);
	body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	for (let i = 1; i < offsets.length; i++) {
		body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
	}
	body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
	return Buffer.from(body, 'utf8');
}

function createChimeWav(durationSec = 1.0, sampleRate = 8000): Buffer {
	const numSamples = Math.floor(durationSec * sampleRate);
	const dataSize = numSamples * 2;
	const buf = Buffer.alloc(44 + dataSize);
	buf.write('RIFF', 0);
	buf.writeUInt32LE(36 + dataSize, 4);
	buf.write('WAVE', 8);
	buf.write('fmt ', 12);
	buf.writeUInt32LE(16, 16);
	buf.writeUInt16LE(1, 20);
	buf.writeUInt16LE(1, 22);
	buf.writeUInt32LE(sampleRate, 24);
	buf.writeUInt32LE(sampleRate * 2, 28);
	buf.writeUInt16LE(2, 32);
	buf.writeUInt16LE(16, 34);
	buf.write('data', 36);
	buf.writeUInt32LE(dataSize, 40);
	for (let i = 0; i < numSamples; i++) {
		const t = i / sampleRate;
		const envFade = Math.exp(-t * 3.5);
		const sample = Math.sin(2 * Math.PI * 528 * t) * envFade * 0.4;
		buf.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
	}
	return buf;
}

async function ensureNeonAuthUser(
	email: string,
	password: string,
	name: string,
): Promise<string> {
	const existing = await prisma.$queryRaw<Array<{ id: string }>>`
		SELECT id::text FROM neon_auth."user" WHERE email = ${email} LIMIT 1
	`;
	if (existing[0]?.id) {
		return existing[0].id;
	}

	const res = await fetch(`${env.NEON_AUTH_URL}/sign-up/email`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Origin: env.CLIENT_BASE_URL,
		},
		body: JSON.stringify({ email, password, name }),
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Failed to provision Neon Auth user ${email}: ${res.status} ${text}`);
	}

	const created = await prisma.$queryRaw<Array<{ id: string }>>`
		SELECT id::text FROM neon_auth."user" WHERE email = ${email} LIMIT 1
	`;
	if (!created[0]?.id) {
		throw new Error(`User ${email} not found in neon_auth.user after sign-up`);
	}
	return created[0].id;
}

async function seed() {
	console.log('Seeding Kinko production-ready workspaces...');

	const demoUserId = await ensureNeonAuthUser(
		DEMO_EMAIL,
		DEMO_PASSWORD,
		DEMO_NAME,
	);
	const primaryRows = await prisma.$queryRaw<Array<{ id: string }>>`
		SELECT id::text FROM neon_auth."user" WHERE email = ${PRIMARY_EMAIL} LIMIT 1
	`;
	const primaryUserId = primaryRows[0]?.id ?? demoUserId;

	for (const uid of new Set([demoUserId, primaryUserId])) {
		await prisma.userProfile.upsert({
			where: { id: uid },
			create: { id: uid, onboardingComplete: true },
			update: { onboardingComplete: true },
		});
	}

	// Workspace 1: Kinko Studio — Brand & Product
	const studioName = 'Kinko Studio — Brand & Product';
	let studio = await prisma.tenant.findFirst({
		where: { name: studioName },
	});

	if (!studio) {
		studio = await prisma.tenant.create({
			data: {
				name: studioName,
				ownerId: primaryUserId,
				storageQuotaBytes: 10n * 1024n * 1024n * 1024n, // 10 GiB
				members: {
					create: [
						{ userId: primaryUserId, role: 'OWNER' },
						...(demoUserId !== primaryUserId
							? [{ userId: demoUserId, role: 'OWNER' as const }]
							: []),
					],
				},
				analytics: { create: {} },
			},
		});

		await prisma.userProfile.updateMany({
			where: { id: { in: [primaryUserId, demoUserId] }, defaultTenantId: null },
			data: { defaultTenantId: studio.id },
		});

		// Folders
		const brandFolder = await prisma.folder.create({
			data: {
				tenantId: studio.id,
				name: '01 Brand & Design',
				createdById: primaryUserId,
			},
		});
		const identityFolder = await prisma.folder.create({
			data: {
				tenantId: studio.id,
				parentFolderId: brandFolder.id,
				name: 'Identity Guidelines',
				createdById: primaryUserId,
			},
		});
		const engFolder = await prisma.folder.create({
			data: {
				tenantId: studio.id,
				name: '02 Engineering Specs',
				createdById: primaryUserId,
			},
		});
		const mediaFolder = await prisma.folder.create({
			data: {
				tenantId: studio.id,
				name: '03 Media Assets',
				createdById: primaryUserId,
			},
		});

		const assets: Array<{
			name: string;
			mimeType: string;
			folderId: string | null;
			body: Buffer;
			deletedAt?: Date;
			extraVersion?: Buffer;
		}> = [
			{
				name: 'kinko-brand-mark.svg',
				mimeType: 'image/svg+xml',
				folderId: identityFolder.id,
				body: Buffer.from(
					`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="32" fill="#FFFFFF"/><rect x="44" y="44" width="168" height="168" rx="20" fill="none" stroke="#111113" stroke-width="14"/><circle cx="128" cy="128" r="34" fill="none" stroke="#111113" stroke-width="14"/><path d="M128 62v32M128 162v32M62 128h32M162 128h32" stroke="#111113" stroke-width="14" stroke-linecap="round"/></svg>`,
					'utf8',
				),
			},
			{
				name: 'vault-grid-preview.png',
				mimeType: 'image/png',
				folderId: brandFolder.id,
				body: createMonochromePng(128, 128),
			},
			{
				name: 'Q4-Product-Architecture-Brief.pdf',
				mimeType: 'application/pdf',
				folderId: null,
				body: createSimplePdf(
					'Kinko Q4 Architecture Brief',
					'Multi-tenant cloud file vault powered by Neon Postgres & Object Storage.',
				),
			},
			{
				name: 'api-contract.ts',
				mimeType: 'text/typescript',
				folderId: engFolder.id,
				body: Buffer.from(
					`export interface VaultFile {\n  id: string;\n  tenantId: string;\n  name: string;\n  mimeType: string;\n  sizeBytes: number;\n  checksumSha256: string | null;\n}\n`,
					'utf8',
				),
			},
			{
				name: 'tenant-isolation-policy.md',
				mimeType: 'text/markdown',
				folderId: engFolder.id,
				body: Buffer.from(
					`# Kinko Tenant Isolation Policy\n\nAll queries and object keys are strictly scoped to \`tenantId\`.\nCross-tenant requests fail uniformly with \`403 Forbidden\`.\n`,
					'utf8',
				),
				extraVersion: Buffer.from(
					`# Kinko Tenant Isolation Policy (v2)\n\nAll queries, presigned URLs, and S3 object keys are scoped to \`tenantId\`.\n`,
					'utf8',
				),
			},
			{
				name: 'release-manifest.json',
				mimeType: 'application/json',
				folderId: engFolder.id,
				body: Buffer.from(
					JSON.stringify(
						{
							service: 'kinko-vault',
							version: '2.0.0',
							storage: 'neon-object-storage',
							palette: ['#FFFFFF', '#F7F7F8', '#E6E6EA', '#111113'],
						},
						null,
						2,
					),
					'utf8',
				),
			},
			{
				name: 'storage-audit.sql',
				mimeType: 'application/sql',
				folderId: engFolder.id,
				body: Buffer.from(
					`SELECT t.name, ta."totalFiles", ta."storageUsedBytes"\nFROM public.tenants t\nJOIN public.tenant_analytics ta ON ta."tenantId" = t.id\nORDER BY ta."storageUsedBytes" DESC;\n`,
					'utf8',
				),
			},
			{
				name: 'vault-chime.wav',
				mimeType: 'audio/wav',
				folderId: mediaFolder.id,
				body: createChimeWav(1.0),
			},
			{
				name: 'Q3-Board-Draft-Deprecated.pdf',
				mimeType: 'application/pdf',
				folderId: null,
				body: createSimplePdf(
					'Q3 Board Draft (Deprecated)',
					'Soft-deleted sample document retained in trash.',
				),
				deletedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
			},
		];

		let totalStoredBytes = 0n;
		let activeFiles = 0;

		for (const asset of assets) {
			const fileId = randomUUID();
			const objectKey = generateObjectKey(studio.id, fileId);
			await putStorageObject({
				key: objectKey,
				body: asset.body,
				contentType: asset.mimeType,
			});

			const checksum = sha256(asset.body);
			let latestKey = objectKey;
			let latestSize = BigInt(asset.body.length);
			let latestChecksum = checksum;
			let versionCount = 1;

			const file = await prisma.file.create({
				data: {
					id: fileId,
					tenantId: studio.id,
					folderId: asset.folderId,
					uploadedById: primaryUserId,
					name: asset.name,
					objectKey,
					mimeType: asset.mimeType,
					sizeBytes: latestSize,
					checksumSha256: checksum,
					currentVersion: 1,
					deletedAt: asset.deletedAt ?? null,
				},
			});

			await prisma.fileVersion.create({
				data: {
					tenantId: studio.id,
					fileId: file.id,
					versionNumber: 1,
					objectKey,
					mimeType: asset.mimeType,
					sizeBytes: latestSize,
					checksumSha256: checksum,
					uploadedById: primaryUserId,
				},
			});

			if (asset.extraVersion) {
				const v2Key = generateObjectKey(studio.id, file.id);
				await putStorageObject({
					key: v2Key,
					body: asset.extraVersion,
					contentType: asset.mimeType,
				});
				latestKey = v2Key;
				latestSize = BigInt(asset.extraVersion.length);
				latestChecksum = sha256(asset.extraVersion);
				versionCount = 2;

				await prisma.fileVersion.create({
					data: {
						tenantId: studio.id,
						fileId: file.id,
						versionNumber: 2,
						objectKey: v2Key,
						mimeType: asset.mimeType,
						sizeBytes: latestSize,
						checksumSha256: latestChecksum,
						uploadedById: primaryUserId,
					},
				});

				await prisma.file.update({
					where: { id: file.id },
					data: {
						objectKey: latestKey,
						sizeBytes: latestSize,
						checksumSha256: latestChecksum,
						currentVersion: versionCount,
					},
				});
			}

			totalStoredBytes += latestSize;
			if (!asset.deletedAt) {
				activeFiles += 1;
			}

			await prisma.activity.create({
				data: {
					tenantId: studio.id,
					actorId: primaryUserId,
					action: asset.deletedAt ? 'FILE_DELETED' : 'FILE_UPLOADED',
					targetType: 'FILE',
					fileId: file.id,
					targetName: file.name,
					metadata: { sizeBytes: Number(latestSize), mimeType: asset.mimeType },
				},
			});
		}

		await prisma.tenantAnalytics.update({
			where: { tenantId: studio.id },
			data: {
				storageUsedBytes: totalStoredBytes,
				totalFiles: activeFiles,
				totalFolders: 4,
				totalUploads: BigInt(assets.length),
				totalDownloads: 14n,
			},
		});

		// 14-day storage usage snapshots
		const today = new Date();
		for (let d = 13; d >= 0; d--) {
			const snapDate = new Date(
				Date.UTC(
					today.getUTCFullYear(),
					today.getUTCMonth(),
					today.getUTCDate() - d,
				),
			);
			const factor = (14 - d) / 14;
			await prisma.storageUsageSnapshot.upsert({
				where: {
					tenantId_snapshotDate: {
						tenantId: studio.id,
						snapshotDate: snapDate,
					},
				},
				create: {
					tenantId: studio.id,
					snapshotDate: snapDate,
					storageUsedBytes: BigInt(Math.round(Number(totalStoredBytes) * factor)),
					fileCount: Math.max(1, Math.round(activeFiles * factor)),
					folderCount: 4,
					uploadCount: d === 0 ? assets.length : 1,
					downloadCount: d % 3 === 0 ? 2 : 1,
				},
				update: {},
			});
		}
	}

	// Idempotent Phase 6 seed enrichments for Kinko Studio
	if (studio) {
		const briefFile = await prisma.file.findFirst({
			where: {
				tenantId: studio.id,
				name: 'Q4-Product-Architecture-Brief.pdf',
				deletedAt: null,
			},
		});
		const brandRootFolder = await prisma.folder.findFirst({
			where: {
				tenantId: studio.id,
				name: '01 Brand & Design',
				deletedAt: null,
			},
		});

		if (briefFile) {
			const existingFavFile = await prisma.favorite.findFirst({
				where: {
					tenantId: studio.id,
					userId: demoUserId,
					fileId: briefFile.id,
				},
			});
			if (!existingFavFile) {
				await prisma.favorite.create({
					data: {
						tenantId: studio.id,
						userId: demoUserId,
						targetType: 'FILE',
						fileId: briefFile.id,
						folderId: null,
					},
				});
			}

			const existingShare = await prisma.fileShare.findFirst({
				where: { tenantId: studio.id, fileId: briefFile.id },
			});
			if (!existingShare) {
				const tokenHash = createHash('sha256')
					.update(randomBytes(32).toString('base64url'))
					.digest('hex');
				await prisma.fileShare.create({
					data: {
						tenantId: studio.id,
						fileId: briefFile.id,
						createdById: demoUserId,
						tokenHash,
						expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
					},
				});
			}

			const existingPermCount = await prisma.filePermission.count({
				where: { tenantId: studio.id, fileId: briefFile.id },
			});
			if (existingPermCount === 0) {
				await prisma.filePermission.create({
					data: {
						tenantId: studio.id,
						fileId: briefFile.id,
						userId: demoUserId,
						role: 'OWNER',
						grantedById: primaryUserId,
					},
				});
				if (primaryUserId !== demoUserId) {
					await prisma.filePermission.create({
						data: {
							tenantId: studio.id,
							fileId: briefFile.id,
							userId: primaryUserId,
							role: 'EDITOR',
							grantedById: demoUserId,
						},
					});
				}
			}
		}

		if (brandRootFolder) {
			const existingFavFolder = await prisma.favorite.findFirst({
				where: {
					tenantId: studio.id,
					userId: demoUserId,
					folderId: brandRootFolder.id,
				},
			});
			if (!existingFavFolder) {
				await prisma.favorite.create({
					data: {
						tenantId: studio.id,
						userId: demoUserId,
						targetType: 'FOLDER',
						fileId: null,
						folderId: brandRootFolder.id,
					},
				});
			}
		}
	}

	// Workspace 2: Northstar Architecture Archive
	const archiveName = 'Northstar Architecture Archive';
	const existingArchive = await prisma.tenant.findFirst({
		where: { name: archiveName },
	});

	if (!existingArchive) {
		const archive = await prisma.tenant.create({
			data: {
				name: archiveName,
				ownerId: demoUserId,
				storageQuotaBytes: 5n * 1024n * 1024n * 1024n, // 5 GiB
				members: {
					create: [
						{ userId: demoUserId, role: 'OWNER' },
						...(primaryUserId !== demoUserId
							? [{ userId: primaryUserId, role: 'ADMIN' as const }]
							: []),
					],
				},
				analytics: { create: {} },
			},
		});

		const plansFolder = await prisma.folder.create({
			data: {
				tenantId: archive.id,
				name: 'Site Plans',
				createdById: demoUserId,
			},
		});

		const docBody = Buffer.from(
			`# Northstar Structural Load Summary\n\n- Wing A: 420 kN/m2 verified\n- Wing B: 380 kN/m2 verified\n`,
			'utf8',
		);
		const fileId = randomUUID();
		const objectKey = generateObjectKey(archive.id, fileId);
		await putStorageObject({
			key: objectKey,
			body: docBody,
			contentType: 'text/markdown',
		});

		const file = await prisma.file.create({
			data: {
				id: fileId,
				tenantId: archive.id,
				folderId: plansFolder.id,
				uploadedById: demoUserId,
				name: 'structural-load-summary.md',
				objectKey,
				mimeType: 'text/markdown',
				sizeBytes: BigInt(docBody.length),
				checksumSha256: sha256(docBody),
			},
		});

		await prisma.fileVersion.create({
			data: {
				tenantId: archive.id,
				fileId: file.id,
				versionNumber: 1,
				objectKey,
				mimeType: 'text/markdown',
				sizeBytes: BigInt(docBody.length),
				checksumSha256: sha256(docBody),
				uploadedById: demoUserId,
			},
		});

		await prisma.tenantAnalytics.update({
			where: { tenantId: archive.id },
			data: {
				storageUsedBytes: BigInt(docBody.length),
				totalFiles: 1,
				totalFolders: 1,
				totalUploads: 1n,
			},
		});
	}

	console.log(`Seed complete. Demo account: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

seed()
	.catch((err) => {
		console.error('Seed failed:', err);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
