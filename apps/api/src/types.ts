export type SuccessStatusCode = 200 | 201 | 202;

export type RedirectStatusCode = 301 | 302 | 303 | 307 | 308;

export type ClientErrorStatusCode = 400 | 401 | 403 | 404 | 409 | 422 | 429;

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
