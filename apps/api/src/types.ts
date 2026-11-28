import type { Tenant, TenantMember, UserProfile } from './generated/prisma/client.js';

export type SuccessStatusCode = 200 | 201 | 202;

export type RedirectStatusCode = 301 | 302 | 303 | 307 | 308;

export type ClientErrorStatusCode =
	| 400
	| 401
	| 403
	| 404
	| 409
	| 410
	| 413
	| 422
	| 429;

export type ServerErrorStatusCode = 500 | 502 | 503 | 504;

export type ErrorCode = ClientErrorStatusCode | ServerErrorStatusCode;

export type SuccessCode = SuccessStatusCode | RedirectStatusCode;

export interface ApiResponse<C = unknown, T = unknown> {
	success: boolean;
	message: string;
	code: C;
	// for error and response
	error?: T;
	payload?: T;
}

export interface AuthUser {
	id: string;
	email: string;
	name: string;
	image?: string | null;
	emailVerified?: boolean;
	createdAt?: Date | string;
	updatedAt?: Date | string;
}

export interface AuthSession {
	id: string;
	userId: string;
	expiresAt: Date | string;
	token?: string;
}

export interface AppVariables {
	user: AuthUser;
	session: AuthSession;
	userProfile: UserProfile;
	tenant: Tenant;
	tenantMembership: TenantMember;
}

export type AppEnv = {
	Variables: AppVariables;
};
