import { ChevronRight, Home } from 'lucide-react';
import { Link } from 'react-router';
import type { BreadcrumbItem } from '../../lib/api';

interface FileBreadcrumbsProps {
	breadcrumbs: BreadcrumbItem[];
}

export function FileBreadcrumbs({ breadcrumbs }: FileBreadcrumbsProps) {
	return (
		<nav
			aria-label="Folder breadcrumbs"
			className="flex items-center gap-1.5 text-sm min-w-0 overflow-x-auto py-1"
		>
			<Link
				to="/files"
				className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0 ${
					breadcrumbs.length === 0
						? 'bg-secondary font-medium text-foreground'
						: 'text-muted-foreground hover:text-foreground hover:bg-secondary/70'
				}`}
			>
				<Home className="size-3.5" aria-hidden="true" />
				<span>Vault Root</span>
			</Link>

			{breadcrumbs.map((crumb, idx) => {
				const isCurrent = idx === breadcrumbs.length - 1;
				return (
					<div key={crumb.id} className="flex items-center gap-1.5 min-w-0">
						<ChevronRight
							className="size-3.5 text-muted-foreground shrink-0"
							aria-hidden="true"
						/>
						{isCurrent ? (
							<span
								aria-current="page"
								className="rounded-md bg-secondary px-2 py-1 font-medium text-foreground truncate max-w-52"
							>
								{crumb.name}
							</span>
						) : (
							<Link
								to={`/files/${crumb.id}`}
								className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-colors truncate max-w-44 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								{crumb.name}
							</Link>
						)}
					</div>
				);
			})}
		</nav>
	);
}
