import pino from 'pino';
import { env } from '../env.ts';

export const REDACT_PATHS = [
	'password',
	'*.password',
	'passwordHash',
	'*.passwordHash',
	'token',
	'*.token',
	'tokenHash',
	'*.tokenHash',
	'secret',
	'*.secret',
	'uploadUrl',
	'*.uploadUrl',
	'downloadUrl',
	'*.downloadUrl',
	'authorization',
	'req.headers.authorization',
	'req.headers.cookie',
	'res.headers["set-cookie"]',
	'DATABASE_URL',
	'DIRECT_URL',
	'AWS_SECRET_ACCESS_KEY',
	'NEON_AUTH_COOKIE_SECRET',
];

export const logger = pino({
	level: env.LOG_LEVEL,
	redact: {
		paths: REDACT_PATHS,
		censor: '[REDACTED]',
	},
	...(env.NODE_ENV === 'development' && {
		transport: {
			target: 'pino-pretty',
			options: {
				colorize: true,
				translateTime: 'SYS:standard',
				ignore: 'pid,hostname',
			},
		},
	}),
});
