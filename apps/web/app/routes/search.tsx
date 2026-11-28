import { Search } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '../components/ui/button';
import type { Route } from './+types/search';

export function meta(_: Route.MetaArgs) {
	return [{ title: 'Search — Kinko' }];
}

export default function SearchPage() {
	return (
		<div className="p-6 sm:p-8 max-w-4xl mx-auto">
			<div className="rounded-2xl border border-border bg-card p-10 text-center space-y-4">
				<div className="size-12 rounded-xl bg-secondary border border-border flex items-center justify-center mx-auto">
					<Search className="size-5 text-muted-foreground" aria-hidden="true" />
				</div>
				<h1 className="text-xl font-semibold tracking-tight">
					Vault Search
				</h1>
				<p className="text-sm text-muted-foreground max-w-md mx-auto">
					Full-text filename search with MIME type, date, and size filters
					arrives in Phase&nbsp;4.
				</p>
				<Button asChild variant="outline">
					<Link to="/files">Back to Files</Link>
				</Button>
			</div>
		</div>
	);
}
