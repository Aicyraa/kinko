import {
	File as FileGenericIcon,
	FileArchive,
	FileAudio,
	FileCode2,
	FileImage,
	FileText,
	FileVideo,
} from 'lucide-react';

export function getFileKindLabel(mimeType: string, fileName: string): string {
	const lower = fileName.toLowerCase();
	if (mimeType.startsWith('image/')) return 'Image';
	if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) return 'PDF';
	if (mimeType.startsWith('audio/')) return 'Audio';
	if (mimeType.startsWith('video/')) return 'Video';
	if (
		mimeType.includes('zip') ||
		mimeType.includes('tar') ||
		mimeType.includes('gzip')
	) {
		return 'Archive';
	}
	if (
		mimeType.startsWith('text/') ||
		mimeType.includes('json') ||
		mimeType.includes('sql') ||
		mimeType.includes('typescript') ||
		/\.(ts|tsx|js|jsx|json|md|sql|txt|yaml|yml|css|html)$/i.test(lower)
	) {
		return 'Code / Text';
	}
	return 'Document';
}

export function FileTypeIcon({
	mimeType,
	fileName,
	className = 'size-4',
}: {
	mimeType: string;
	fileName: string;
	className?: string;
}) {
	const kind = getFileKindLabel(mimeType, fileName);
	if (kind === 'Image') {
		return <FileImage className={className} aria-hidden="true" />;
	}
	if (kind === 'PDF') {
		return <FileText className={className} aria-hidden="true" />;
	}
	if (kind === 'Audio') {
		return <FileAudio className={className} aria-hidden="true" />;
	}
	if (kind === 'Video') {
		return <FileVideo className={className} aria-hidden="true" />;
	}
	if (kind === 'Archive') {
		return <FileArchive className={className} aria-hidden="true" />;
	}
	if (kind === 'Code / Text') {
		return <FileCode2 className={className} aria-hidden="true" />;
	}
	return <FileGenericIcon className={className} aria-hidden="true" />;
}
