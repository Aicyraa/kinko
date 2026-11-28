import { randomBytes } from 'node:crypto';
import {
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../env.ts';

export const storage = new S3Client({
	region: env.AWS_REGION,
	endpoint: env.AWS_ENDPOINT_URL_S3,
	credentials: {
		accessKeyId: env.AWS_ACCESS_KEY_ID,
		secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
	},
	forcePathStyle: true,
	requestChecksumCalculation: 'WHEN_REQUIRED',
});

export function generateObjectKey(tenantId: string, fileId: string): string {
	const token = randomBytes(16).toString('hex');
	return `${tenantId}/${fileId}/${token}`;
}

export async function createPresignedUploadUrl(params: {
	key: string;
	contentType: string;
	expiresInSeconds?: number;
	bucket?: string;
}): Promise<string> {
	const command = new PutObjectCommand({
		Bucket: params.bucket ?? env.STORAGE_BUCKET_UPLOADS,
		Key: params.key,
		ContentType: params.contentType,
	});
	return getSignedUrl(storage, command, {
		expiresIn: params.expiresInSeconds ?? 300,
	});
}

function encodeContentDisposition(
	disposition: 'attachment' | 'inline',
	fileName: string,
): string {
	const sanitizedAscii = fileName.replace(/["\\\r\n]/g, '_');
	const encoded = encodeURIComponent(fileName).replace(
		/[!'()*]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
	);
	return `${disposition}; filename="${sanitizedAscii}"; filename*=UTF-8''${encoded}`;
}

export async function createPresignedDownloadUrl(params: {
	key: string;
	fileName: string;
	disposition?: 'attachment' | 'inline';
	expiresInSeconds?: number;
	bucket?: string;
}): Promise<string> {
	const command = new GetObjectCommand({
		Bucket: params.bucket ?? env.STORAGE_BUCKET_UPLOADS,
		Key: params.key,
		ResponseContentDisposition: encodeContentDisposition(
			params.disposition ?? 'attachment',
			params.fileName,
		),
	});
	return getSignedUrl(storage, command, {
		expiresIn: params.expiresInSeconds ?? 300,
	});
}

export type HeadObjectResult =
	| {
			exists: true;
			contentLength: number;
			contentType: string | undefined;
			eTag: string | undefined;
	  }
	| { exists: false };

export async function headStorageObject(
	key: string,
	bucket = env.STORAGE_BUCKET_UPLOADS,
): Promise<HeadObjectResult> {
	try {
		const res = await storage.send(
			new HeadObjectCommand({ Bucket: bucket, Key: key }),
		);
		return {
			exists: true,
			contentLength: res.ContentLength ?? 0,
			contentType: res.ContentType,
			eTag: res.ETag,
		};
	} catch (err) {
		const statusCode = (err as { $metadata?: { httpStatusCode?: number } })
			?.$metadata?.httpStatusCode;
		const name = (err as { name?: string })?.name;
		if (statusCode === 404 || name === 'NotFound' || name === 'NoSuchKey') {
			return { exists: false };
		}
		throw err;
	}
}

export async function putStorageObject(params: {
	key: string;
	body: Buffer | Uint8Array | string;
	contentType: string;
	bucket?: string;
}): Promise<void> {
	await storage.send(
		new PutObjectCommand({
			Bucket: params.bucket ?? env.STORAGE_BUCKET_UPLOADS,
			Key: params.key,
			Body: params.body,
			ContentType: params.contentType,
		}),
	);
}

export async function getStorageObjectBytes(
	key: string,
	bucket = env.STORAGE_BUCKET_UPLOADS,
): Promise<Buffer> {
	const res = await storage.send(
		new GetObjectCommand({ Bucket: bucket, Key: key }),
	);
	if (!res.Body) {
		return Buffer.alloc(0);
	}
	const bytes = await res.Body.transformToByteArray();
	return Buffer.from(bytes);
}

export async function deleteStorageObject(
	key: string,
	bucket = env.STORAGE_BUCKET_UPLOADS,
): Promise<void> {
	await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
