import z from 'zod';

export const SignUpSchema = z
	.object({
		name: z.string().trim().min(1, 'Name is required').max(80),
		email: z.email('Enter a valid email address').trim(),
		password: z
			.string()
			.min(8, 'Password must be at least 8 characters')
			.max(64, 'Password must be 64 characters or fewer')
			.regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
			.regex(/[a-z]/, 'Password must contain at least one lowercase letter')
			.regex(/[0-9]/, 'Password must contain at least one number')
			.regex(
				/[^A-Za-z0-9]/,
				'Password must contain at least one special character',
			),
		passwordConfirm: z.string().min(1, 'Please confirm your password'),
	})
	.refine((data) => data.password === data.passwordConfirm, {
		message: 'Passwords do not match',
		path: ['passwordConfirm'],
	});

export type SignUpType = z.infer<typeof SignUpSchema>;

export const SignInSchema = z.object({
	email: z.email('Enter a valid email address').trim(),
	password: z.string().min(1, 'Password is required'),
});

export type SignInType = z.infer<typeof SignInSchema>;
