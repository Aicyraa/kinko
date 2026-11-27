import { Hono } from 'hono'
import { SignUpSchema, SingInSchema } from './auth.schema.ts'
import { checkSession, neonHandler, signin, signup } from './auth.controller.ts'
import { zValidator } from '@hono/zod-validator'

export const auth = new Hono()
	.get('/me', ...checkSession)
	.post('/signup', zValidator('form', SignUpSchema), ...signup)
    .post('/signin', zValidator('form', SingInSchema), ...signin)
    .all('/*', ...neonHandler)
