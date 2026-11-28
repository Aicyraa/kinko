import { Navigate, Outlet } from 'react-router';
import { AppShell } from '../components/layout/app-shell';
import { useSession } from '../hooks/use-auth';
import { UploadQueueProvider } from '../hooks/use-upload-queue';

export default function AppLayout() {
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

	if (!session) {
		return <Navigate to="/signin" replace />;
	}

	return (
		<UploadQueueProvider>
			<AppShell session={session}>
				<Outlet />
			</AppShell>
		</UploadQueueProvider>
	);
}
