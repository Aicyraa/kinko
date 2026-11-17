import type { NotFoundHandler } from 'hono'

export const notFound: NotFoundHandler = c => {
	return c.json(
		{
			status: 'not found',
			code: 404,
			path: c.req.path
		},
		404
	)
}
