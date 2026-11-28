import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type FormEvent, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useSignIn, useSignUp } from '../../hooks/use-auth';
import { ApiError } from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

interface AuthFormProps {
	mode: 'signin' | 'signup';
}

export function AuthForm({ mode }: AuthFormProps) {
	const navigate = useNavigate();
	const signIn = useSignIn();
	const signUp = useSignUp();

	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [passwordConfirm, setPasswordConfirm] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);

	const nameId = useId();
	const emailId = useId();
	const passwordId = useId();
	const confirmId = useId();

	const isPending = signIn.isPending || signUp.isPending;

	async function handleSubmit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setFormError(null);

		if (mode === 'signup') {
			if (!name.trim()) {
				setFormError('Please enter your full name.');
				return;
			}
			if (password !== passwordConfirm) {
				setFormError('Passwords do not match.');
				return;
			}
		}

		try {
			if (mode === 'signin') {
				await signIn.mutateAsync({ email: email.trim(), password });
				toast.success('Signed in to Kinko');
			} else {
				await signUp.mutateAsync({
					name: name.trim(),
					email: email.trim(),
					password,
					passwordConfirm,
				});
				toast.success('Account created & workspace provisioned');
			}
			navigate('/', { replace: true });
		} catch (err) {
			const message =
				err instanceof ApiError
					? err.message
					: 'Authentication failed. Check your credentials and try again.';
			setFormError(message);
		}
	}

	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
			className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-xs"
		>
			{/* Mobile header */}
			<div className="lg:hidden flex items-center gap-2.5 mb-6">
				<div className="size-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-mono text-xs font-semibold">
					金
				</div>
				<span translate="no" className="text-base font-semibold tracking-tight">
					Kinko
				</span>
			</div>

			{/* Mode switcher with shared layoutId indicator */}
			<div
				role="tablist"
				aria-label="Authentication mode"
				className="grid grid-cols-2 rounded-lg bg-secondary p-1 border border-border mb-6"
			>
				<Link
					to="/signin"
					role="tab"
					aria-selected={mode === 'signin'}
					onClick={() => setFormError(null)}
					className="relative py-2 text-center text-sm font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					{mode === 'signin' && (
						<motion.span
							layoutId="auth-mode-pill"
							transition={{ type: 'spring', stiffness: 420, damping: 32 }}
							className="absolute inset-0 rounded-md bg-card shadow-xs border border-border"
						/>
					)}
					<span
						className={`relative z-10 ${
							mode === 'signin' ? 'text-foreground' : 'text-muted-foreground'
						}`}
					>
						Sign In
					</span>
				</Link>

				<Link
					to="/signup"
					role="tab"
					aria-selected={mode === 'signup'}
					onClick={() => setFormError(null)}
					className="relative py-2 text-center text-sm font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					{mode === 'signup' && (
						<motion.span
							layoutId="auth-mode-pill"
							transition={{ type: 'spring', stiffness: 420, damping: 32 }}
							className="absolute inset-0 rounded-md bg-card shadow-xs border border-border"
						/>
					)}
					<span
						className={`relative z-10 ${
							mode === 'signup' ? 'text-foreground' : 'text-muted-foreground'
						}`}
					>
						Create Account
					</span>
				</Link>
			</div>

			<div className="space-y-1.5 mb-6">
				<h2 className="text-xl font-semibold tracking-tight text-balance">
					{mode === 'signin' ? 'Welcome back' : 'Create your vault'}
				</h2>
				<p className="text-sm text-muted-foreground">
					{mode === 'signin'
						? 'Sign in with your email and password to access your workspaces.'
						: 'Your default private workspace will be provisioned automatically.'}
				</p>
			</div>

			<AnimatePresence mode="wait">
				{formError && (
					<motion.div
						key={formError}
						initial={{ opacity: 0, y: -6 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -6 }}
						transition={{ duration: 0.18 }}
						role="alert"
						aria-live="polite"
						className="mb-5 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
					>
						{formError}
					</motion.div>
				)}
			</AnimatePresence>

			<form onSubmit={handleSubmit} className="space-y-4" noValidate>
				{mode === 'signup' && (
					<div className="space-y-1.5">
						<Label htmlFor={nameId}>Full Name</Label>
						<Input
							id={nameId}
							name="name"
							type="text"
							autoComplete="name"
							placeholder="Ada Lovelace…"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
							disabled={isPending}
						/>
					</div>
				)}

				<div className="space-y-1.5">
					<Label htmlFor={emailId}>Email Address</Label>
					<Input
						id={emailId}
						name="email"
						type="email"
						autoComplete="email"
						spellCheck={false}
						placeholder="name@company.com…"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
						disabled={isPending}
					/>
				</div>

				<div className="space-y-1.5">
					<Label htmlFor={passwordId}>Password</Label>
					<div className="relative">
						<Input
							id={passwordId}
							name="password"
							type={showPassword ? 'text' : 'password'}
							autoComplete={
								mode === 'signin' ? 'current-password' : 'new-password'
							}
							placeholder="Enter your password…"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							disabled={isPending}
							className="pr-10"
						/>
						<button
							type="button"
							aria-label={showPassword ? 'Hide password' : 'Show password'}
							onClick={() => setShowPassword((prev) => !prev)}
							className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{showPassword ? (
								<EyeOff className="size-4" aria-hidden="true" />
							) : (
								<Eye className="size-4" aria-hidden="true" />
							)}
						</button>
					</div>
					{mode === 'signup' && (
						<p className="text-xs text-muted-foreground">
							8+ chars with uppercase, lowercase, number, and symbol.
						</p>
					)}
				</div>

				{mode === 'signup' && (
					<div className="space-y-1.5">
						<Label htmlFor={confirmId}>Confirm Password</Label>
						<Input
							id={confirmId}
							name="passwordConfirm"
							type={showPassword ? 'text' : 'password'}
							autoComplete="new-password"
							placeholder="Re-enter your password…"
							value={passwordConfirm}
							onChange={(e) => setPasswordConfirm(e.target.value)}
							required
							disabled={isPending}
						/>
					</div>
				)}

				<Button
					type="submit"
					disabled={isPending}
					className="w-full h-10 mt-2 font-medium"
				>
					{isPending ? (
						<>
							<Loader2 className="size-4 animate-spin" aria-hidden="true" />
							<span>
								{mode === 'signin' ? 'Signing in…' : 'Creating account…'}
							</span>
						</>
					) : mode === 'signin' ? (
						'Sign In'
					) : (
						'Create Account'
					)}
				</Button>
			</form>
		</motion.div>
	);
}
