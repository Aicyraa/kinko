import { useParams } from 'react-router';
import { FileManagerView } from '../components/files/file-manager-view';
import type { Route } from './+types/files-folder';

export function meta(_: Route.MetaArgs) {
	return [{ title: 'Folder — Kinko' }];
}

export default function FilesFolderPage() {
	const { folderId } = useParams();
	return <FileManagerView folderId={folderId ?? null} />;
}
