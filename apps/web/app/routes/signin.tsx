import { Navigate } from 'react-router';
import { AuthForm } from '../components/auth/auth-form';
import { AuthShell } from '../components/auth/auth-shell';
import { useSession } from '../hooks/use-auth';
import type { Route } from './+types/signin';

export function meta(_: Route.MetaArgs) {
	return [{ title: 'Sign In — Kinko' }];
}

export default function SignInPage() {
	const { data: session, isLoading } = useSession();

	if (!isLoading && session) {
		return <Navigate to="/" replace />;
	}

	return (
		<AuthShell>
			<AuthForm mode="signin" />
		</AuthShell>
	);
}
