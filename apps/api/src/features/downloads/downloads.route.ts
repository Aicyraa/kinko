import { Hono } from 'hono';
import type { AppEnv } from '../../types.ts';
import { downloadZipHandler } from './downloads.controller.ts';

export const downloads = new Hono<AppEnv>().post(
	'/zip',
	...downloadZipHandler,
);
