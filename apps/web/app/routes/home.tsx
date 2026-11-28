import { AuthForm } from '../components/auth/auth-form';
import { AuthShell } from '../components/auth/auth-shell';
import { WorkspaceHome } from '../components/auth/workspace-home';
import { useSession } from '../hooks/use-auth';
import type { Route } from './+types/home';

export function meta(_: Route.MetaArgs) {
	return [
		{ title: 'Kinko — Cloud File Vault' },
		{
			name: 'description',
			content: 'Tenant-isolated cloud file management and analytics.',
		},
	];
}

export default function Home() {
	const { data: session, isLoading } = useSession();

	if (isLoading) {
		return (
			<main className="min-h-screen bg-secondary flex items-center justify-center p-6">
				<div className="flex items-center gap-3 text-sm text-muted-foreground">
					<div className="size-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
					<span>Restoring session…</span>
				</div>
			</main>
		);
	}

	if (session) {
		return <WorkspaceHome session={session} />;
	}

	return (
		<AuthShell>
			<AuthForm mode="signin" />
		</AuthShell>
	);
}
