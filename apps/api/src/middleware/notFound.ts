import type { NotFoundHandler } from 'hono';
import { errorResponse } from '../utils/response.ts';

export const notFound: NotFoundHandler = (c) => {
	return errorResponse(c, 'Not found', { path: c.req.path }, 404);
};
