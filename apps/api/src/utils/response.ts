import type { Context } from 'hono';
import type { ErrorCode, SuccessCode } from '../types.ts';

export const errorResponse = <T>(
	c: Context,
	message: string,
	error = {} as T,
	code = 500 as ErrorCode ,

) => {
	return c.json(
		{
			success: false,
			message,
			code,
			error,
		},
		code,
	);
};

export const successResponse = <T>(
	c: Context,
	message: string,
	payload = {} as T,
	code = 200 as SuccessCode,
) => {
	return c.json(
		{
			success: true,
			message,
			code,
			payload,
		},
		code,
	);
};
