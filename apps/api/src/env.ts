import 'dotenv/config';
import { z } from 'zod';

/* ------------------------------------------------------------------ *
 * Small reusable rules
 * ------------------------------------------------------------------ */

const requiredText = z.string().trim().min(1, 'Value cannot be empty');

const postgresUrl = z
	.url('Must be a valid connection URL')
	.refine(
		(value) => /^postgres(?:ql)?:\/\//.test(value),
		'Must start with postgres:// or postgresql://',
	);

// S3-style bucket names: 3-63 chars, lowercase, start/end alphanumeric.
const bucketName = z
	.string()
	.regex(
		/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/,
		'Use 3-63 lowercase letters, numbers, dots or hyphens (start/end alphanumeric)',
	);

/* ------------------------------------------------------------------ *
 * 1. Runtime bucket
 * ------------------------------------------------------------------ */

const runtimeSchema = z.object({
	NODE_ENV: z
		.enum(['development', 'production', 'test'])
		.default('development'),
	PORT: z.coerce.number().int().min(1).max(65535).default(3000),
	LOG_LEVEL: z
		.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
		.default('info'),
});

/* ------------------------------------------------------------------ *
 * 2. Database / Neon branch bucket
 * ------------------------------------------------------------------ */

const databaseSchema = z.object({
	// Pooled connection — used by the app at runtime.
	DATABASE_URL: postgresUrl,
	// Direct connection — used by Prisma CLI (migrations + Studio).
	DIRECT_URL: postgresUrl.optional(),
	// Neon's own name for the unpooled URL, injected by `neon-env run`.
	DATABASE_URL_UNPOOLED: postgresUrl.optional(),

	NEON_BRANCH: requiredText.optional(),
	NEON_BRANCH_ID: z
		.string()
		.regex(/^br-[a-z0-9-]+$/, 'Branch id must look like br-xxxx')
		.optional(),
	NEON_FUNCTION_HOST_SUFFIX: z
		.string()
		.startsWith('.', 'Host suffix must start with a dot')
		.optional(),
});

/* ------------------------------------------------------------------ *
 * 3. Storage bucket — the 4 AWS_* variables + bucket settings
 * ------------------------------------------------------------------ */

const storageSchema = z.object({
	AWS_ENDPOINT_URL_S3: z.url('AWS_ENDPOINT_URL_S3 must be a valid URL'),
	AWS_ACCESS_KEY_ID: requiredText,
	AWS_SECRET_ACCESS_KEY: requiredText.min(
		16,
		'Secret access key looks too short',
	),
	AWS_REGION: requiredText.regex(
		/^[a-z]{2}(?:-[a-z0-9]+)+-\d+$/,
		'Region should look like ap-southeast-1 or us-east-2',
	),

	STORAGE_BUCKET_TRASH: bucketName,
	STORAGE_BUCKET_UPLOADS: bucketName,
	FILE_SIZE: z.coerce
		.number()
		.int()
		.positive()
		.max(1_000_000_000, 'FILE_SIZE is in bytes; 1 GB maximum')
		.describe('Maximum upload size in bytes'),
});

/* ------------------------------------------------------------------ *
 * 4. Auth bucket
 * ------------------------------------------------------------------ */

const authSchema = z.object({
	NEON_AUTH_COOKIE_SECRET: z
		.string()
		.min(32, 'Secret must be at least 32 characters')
		.regex(
			/^[A-Za-z0-9+/=_-]+$/,
			'Secret must be base64/base64url characters (no spaces or punctuation)',
		),
	NEON_AUTH_URL: z.url('NEON_AUTH_URL must be a valid URL'),
});

const clientSchema = z.object({
	CLIENT_BASE_URL: z.url(),
});
/* ------------------------------------------------------------------ *
 * Combine, validate, export
 * ------------------------------------------------------------------ */

const envSchema = runtimeSchema
	.merge(databaseSchema)
	.merge(storageSchema)
	.merge(authSchema)
	.merge(clientSchema)
	.superRefine((value, ctx) => {
		if (value.STORAGE_BUCKET_TRASH === value.STORAGE_BUCKET_UPLOADS) {
			ctx.addIssue({
				code: 'custom',
				path: ['STORAGE_BUCKET_UPLOADS'],
				message: 'Trash and uploads must be different buckets',
			});
		}
	});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
	console.error(
		`Invalid environment variables:\n${z.prettifyError(parsed.error)}`,
	);
	process.exit(1);
}

// Flat object keeps existing imports working: env.DATABASE_URL, env.PORT, etc.
export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
