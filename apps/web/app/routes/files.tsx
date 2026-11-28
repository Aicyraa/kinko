import { FileManagerView } from '../components/files/file-manager-view';
import type { Route } from './+types/files';

export function meta(_: Route.MetaArgs) {
	return [{ title: 'Files — Kinko' }];
}

export default function FilesPage() {
	return <FileManagerView folderId={null} />;
}
