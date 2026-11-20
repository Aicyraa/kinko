import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../env.ts';
import { storage } from '../lib/storage.ts';

const bucket = env.STORAGE_BUCKET_UPLOADS;
const key = 'smoke/file.txt';

await storage.send(
	new PutObjectCommand({ Bucket: bucket, Key: key, Body: 'Hello?' }),
);

const fetchedFileURL = await getSignedUrl(
	storage,
	new GetObjectCommand({ Bucket: bucket, Key: key }),
	{ expiresIn: 3600 },
);

console.log(`[Smoke]: ${fetchedFileURL}`);
