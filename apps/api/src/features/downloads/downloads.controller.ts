import { createFactory } from 'hono/factory';
import { requireAuth } from '../../middleware/requireAuth.ts';
import { requireTenant } from '../../middleware/requireTenant.ts';
import type { AppEnv } from '../../types.ts';
import { validate } from '../../utils/validate.ts';
import { ZipDownloadSchema } from './downloads.schema.ts';
import { buildZipArchive } from './downloads.service.ts';

const factory = createFactory<AppEnv>();

export const downloadZipHandler = factory.createHandlers(
	requireAuth,
	requireTenant,
	validate('json', ZipDownloadSchema),
	async (c) => {
		const tenant = c.get('tenant');
		const membership = c.get('tenantMembership');
		const user = c.get('user');
		const body = c.req.valid('json');

		const { buffer, fileName } = await buildZipArchive(
			tenant.id,
			membership,
			user.id,
			body,
		);

		return new Response(new Uint8Array(buffer), {
			status: 200,
			headers: {
				'Content-Type': 'application/zip',
				'Content-Disposition': `attachment; filename="${fileName}"`,
				'Content-Length': String(buffer.byteLength),
				'Cache-Control': 'no-store',
			},
		});
	},
);
