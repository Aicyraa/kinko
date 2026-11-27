import { Hono } from 'hono'
import {
	checkSession,
	neonHandler,
	signin,
	signout,
	signup,
} from './auth.controller.ts'

export const auth = new Hono()
	.get('/me', ...checkSession)
	.post('/signup', ...signup)
	.post('/signin', ...signin)
	.post('/signout', ...signout)
	.all('/*', ...neonHandler)
