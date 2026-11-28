import { PassThrough } from 'node:stream';
import { Hono } from 'hono';
import pino from 'pino';
import { afterEach, describe, expect, it } from 'vitest';
import { REDACT_PATHS } from '../../lib/logger.ts';
import {
	createRateLimiter,
	resetRateLimiters,
} from '../../middleware/rateLimit.ts';
import { enforceBodyLimit } from '../../middleware/requestLimits.ts';
import type { AppEnv } from '../../types.ts';
import {
	serializeFile,
	serializeTenant,
	serializeUpload,
} from '../../utils/serialize.ts';
import { sanitizeActivityMetadata } from '../activities/activities.service.ts';
import {
	hashSharePassword,
	hashShareToken,
	verifySharePassword,
} from '../shares/shares.service.ts';

describe('Core Services & Security Middleware Unit Tests (#71, #76, #77, #82)', () => {
	afterEach(() => {
		resetRateLimiters();
	});

	it('sanitizes activity metadata by removing sensitive keys recursively (#64, #82)', () => {
		const cleaned = sanitizeActivityMetadata({
			shareId: 'share-1',
			token: 'secret-token',
			password: 'raw-password',
			uploadUrl: 'https://s3.example/presigned',
			nested: {
				downloadUrl: 'https://s3.example/dl',
				sizeBytes: 128,
			},
		});

		expect(cleaned).toEqual({
			shareId: 'share-1',
			nested: { sizeBytes: 128 },
		});
	});

	it('hashes share tokens deterministically and verifies scrypt share passwords (#65, #71)', () => {
		const tokenHashA = hashShareToken('abc-token-123');
		const tokenHashB = hashShareToken('abc-token-123');
		expect(tokenHashA).toBe(tokenHashB);
		expect(tokenHashA).toHaveLength(64);

		const pwHash = hashSharePassword('VaultSecret#2026');
		expect(pwHash).not.toContain('VaultSecret#2026');
		expect(verifySharePassword('VaultSecret#2026', pwHash)).toBe(true);
		expect(verifySharePassword('wrong-password', pwHash)).toBe(false);
		expect(verifySharePassword('VaultSecret#2026', 'malformed')).toBe(false);
	});

	it('serializes Tenant, File, and Upload DTOs with numeric sizes and ISO dates (#71)', () => {
		const now = new Date('2026-11-28T00:00:00.000Z');
		const tenant = serializeTenant({
			id: 't-1',
			name: 'Vault',
			ownerId: 'u-1',
			storageQuotaBytes: 1024n,
			createdAt: now,
			updatedAt: now,
		});
		expect(tenant.storageQuotaBytes).toBe(1024);
		expect(tenant.createdAt).toBe(now.toISOString());

		const file = serializeFile({
			id: 'f-1',
			tenantId: 't-1',
			folderId: null,
			uploadedById: 'u-1',
			name: 'brief.pdf',
			objectKey: 't-1/f-1/abc',
			mimeType: 'application/pdf',
			sizeBytes: 512n,
			checksumSha256: 'deadbeef',
			currentVersion: 2,
			createdAt: now,
			updatedAt: now,
			deletedAt: null,
		});
		expect(file.sizeBytes).toBe(512);
		expect(file.currentVersion).toBe(2);

		const upload = serializeUpload({
			id: 'up-1',
			tenantId: 't-1',
			folderId: null,
			fileId: null,
			uploadedById: 'u-1',
			fileName: 'big.bin',
			mimeType: 'application/octet-stream',
			declaredSizeBytes: 5_242_880n,
			objectKey: 't-1/up-1/obj',
			status: 'IN_PROGRESS',
			isMultipart: true,
			s3UploadId: 's3-id',
			partSizeBytes: 5_242_880,
			totalParts: 2,
			expiresAt: now,
			completedAt: null,
			createdAt: now,
			updatedAt: now,
		});
		expect(upload.isMultipart).toBe(true);
		expect(upload.totalParts).toBe(2);
	});

	it('enforces rate limits with 429 and Retry-After header (#76)', async () => {
		const testApp = new Hono<AppEnv>();
		testApp.use(
			'*',
			createRateLimiter({ windowMs: 60_000, maxRequests: 2, keyPrefix: 'unit' }),
		);
		testApp.get('/ping', (c) => c.json({ ok: true }));

		const r1 = await testApp.request('/ping');
		expect(r1.status).toBe(200);
		expect(r1.headers.get('X-RateLimit-Remaining')).toBe('1');

		const r2 = await testApp.request('/ping');
		expect(r2.status).toBe(200);
		expect(r2.headers.get('X-RateLimit-Remaining')).toBe('0');

		const r3 = await testApp.request('/ping');
		expect(r3.status).toBe(429);
		expect(r3.headers.get('Retry-After')).toBeTruthy();
	});

	it('rejects oversized request bodies with 413 before handler execution (#77)', async () => {
		const testApp = new Hono<AppEnv>();
		testApp.use('*', enforceBodyLimit(64));
		testApp.post('/echo', async (c) => {
			const body = await c.req.text();
			return c.json({ length: body.length });
		});

		const okRes = await testApp.request('/echo', {
			method: 'POST',
			body: 'hello',
		});
		expect(okRes.status).toBe(200);

		const largeBody = 'x'.repeat(128);
		const bigHeaderRes = await testApp.request('/echo', {
			method: 'POST',
			headers: { 'Content-Length': String(largeBody.length) },
			body: largeBody,
		});
		expect(bigHeaderRes.status).toBe(413);

		const bigNoHeaderRes = await testApp.request('/echo', {
			method: 'POST',
			body: largeBody,
		});
		expect(bigNoHeaderRes.status).toBe(413);
	});

	it('redacts secrets, tokens, and presigned URLs in Pino log output (#82)', () => {
		const chunks: string[] = [];
		const stream = new PassThrough();
		stream.on('data', (chunk: Buffer) => chunks.push(chunk.toString('utf8')));

		const testLogger = pino(
			{
				level: 'info',
				redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
			},
			stream,
		);

		testLogger.info(
			{
				password: 'plain-password',
				token: 'share-token-xyz',
				AWS_SECRET_ACCESS_KEY: 'super-secret-aws',
				nested: { uploadUrl: 'https://s3.example/put?sig=123' },
				safeField: 'visible',
			},
			'audit test',
		);

		const output = chunks.join('');
		expect(output).toContain('[REDACTED]');
		expect(output).toContain('visible');
		expect(output).not.toContain('plain-password');
		expect(output).not.toContain('share-token-xyz');
		expect(output).not.toContain('super-secret-aws');
		expect(output).not.toContain('https://s3.example/put?sig=123');
	});
});
