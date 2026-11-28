import { MotionConfig } from 'motion/react';
import { ThemeProvider } from 'next-themes';
import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
} from 'react-router';

import type { Route } from './+types/root';
import { Toaster } from './components/ui/sonner';
import './app.css';
import { QueryProvider } from './lib/query-provider';

export const links: Route.LinksFunction = () => [
	{ rel: 'preconnect', href: 'https://fonts.googleapis.com' },
	{
		rel: 'preconnect',
		href: 'https://fonts.gstatic.com',
		crossOrigin: 'anonymous',
	},
	{
		rel: 'stylesheet',
		href: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap',
	},
];

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<meta name="theme-color" content="#FFFFFF" />
				<Meta />
				<Links />
			</head>
			<body>
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	return (
		<ThemeProvider
			attribute="class"
			defaultTheme="light"
			enableSystem
			disableTransitionOnChange
		>
			<MotionConfig reducedMotion="user">
				<QueryProvider>
					<Outlet />
					<Toaster />
				</QueryProvider>
			</MotionConfig>
		</ThemeProvider>
	);
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	let message = 'Something went wrong';
	let details = 'An unexpected error occurred.';
	let stack: string | undefined;

	if (isRouteErrorResponse(error)) {
		message = error.status === 404 ? '404' : 'Error';
		details =
			error.status === 404
				? 'The requested page could not be found.'
				: error.statusText || details;
	} else if (import.meta.env.DEV && error && error instanceof Error) {
		details = error.message;
		stack = error.stack;
	}

	return (
		<main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
			<div className="max-w-lg w-full rounded-xl border border-border bg-card p-6 space-y-3">
				<h1 className="text-2xl font-semibold tracking-tight">{message}</h1>
				<p className="text-sm text-muted-foreground">{details}</p>
				{stack && (
					<pre className="w-full p-3 rounded-lg bg-secondary text-xs font-mono overflow-x-auto">
						<code>{stack}</code>
					</pre>
				)}
			</div>
		</main>
	);
}
