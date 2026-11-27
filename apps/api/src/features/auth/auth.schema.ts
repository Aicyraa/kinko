import z from "zod";

export const SignUpSchema = z
	.object({
		name: z.string().trim().min(1, 'name cannot be less than 1'),
		email: z.email('not a valid email').trim(),
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
		passwordConfirm: z.string().min(1, 'password doesnt match'),
	})
	.refine((data) => data.password === data.passwordConfirm, {
		error: (issue) => `password doesn't match ${issue.input}`,
	});

export type SignUpType = z.infer<typeof SignUpSchema>

export const SingInSchema = z.object({
	email: z.email('not a valid email').trim(),
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
});

export type SignInType = z.infer<typeof SingInSchema>