import { index, layout, type RouteConfig, route } from '@react-router/dev/routes';

export default [
	index('routes/home.tsx'),
	route('signin', 'routes/signin.tsx'),
	route('signup', 'routes/signup.tsx'),
	route('s/:token', 'routes/share-public.tsx'),
	layout('routes/app-layout.tsx', [
		route('dashboard', 'routes/dashboard.tsx'),
		route('files', 'routes/files.tsx'),
		route('files/:folderId', 'routes/files-folder.tsx'),
		route('search', 'routes/search.tsx'),
		route('favorites', 'routes/favorites.tsx'),
		route('trash', 'routes/trash.tsx'),
		route('settings', 'routes/settings.tsx'),
	]),
] satisfies RouteConfig;
