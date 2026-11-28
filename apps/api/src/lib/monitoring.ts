import { env } from '../env.ts';
import { logger } from './logger.ts';

export interface ErrorReportContext {
	errorId: string;
	path: string;
	method: string;
	status: number;
	tenantId?: string;
	userId?: string;
}

export function reportError(err: unknown, context: ErrorReportContext): void {
	const errorName = err instanceof Error ? err.name : 'UnknownError';
	const errorMessage = err instanceof Error ? err.message : String(err);

	logger.error(
		{
			errorId: context.errorId,
			path: context.path,
			method: context.method,
			status: context.status,
			tenantId: context.tenantId,
			userId: context.userId,
			err,
		},
		'error occurred in request',
	);

	if (env.ERROR_MONITORING_WEBHOOK_URL && context.status >= 500) {
		void fetch(env.ERROR_MONITORING_WEBHOOK_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				service: 'kinko-api',
				errorId: context.errorId,
				path: context.path,
				method: context.method,
				status: context.status,
				errorName,
				errorMessage,
				tenantId: context.tenantId ?? null,
				timestamp: new Date().toISOString(),
			}),
		}).catch(() => {});
	}
}
