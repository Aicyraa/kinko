import { Navigate } from 'react-router';
import { AuthForm } from '../components/auth/auth-form';
import { AuthShell } from '../components/auth/auth-shell';
import { useSession } from '../hooks/use-auth';
import type { Route } from './+types/signup';

export function meta(_: Route.MetaArgs) {
	return [{ title: 'Create Account — Kinko' }];
}

export default function SignUpPage() {
	const { data: session, isLoading } = useSession();

	if (!isLoading && session) {
		return <Navigate to="/" replace />;
	}

	return (
		<AuthShell>
			<AuthForm mode="signup" />
		</AuthShell>
	);
}
