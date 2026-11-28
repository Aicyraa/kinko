import { FolderInput, FolderArchive, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '../ui/button';

interface SelectionBarProps {
	count: number;
	onMove: () => void;
	onDownloadZip: () => void;
	isZipDownloading?: boolean;
	onDelete: () => void;
	onClear: () => void;
}

export function SelectionBar({
	count,
	onMove,
	onDownloadZip,
	isZipDownloading = false,
	onDelete,
	onClear,
}: SelectionBarProps) {
	return (
		<AnimatePresence>
			{count > 0 && (
				<motion.div
					role="region"
					aria-label="Bulk selection actions"
					initial={{ opacity: 0, y: 24, scale: 0.97 }}
					animate={{ opacity: 1, y: 0, scale: 1 }}
					exit={{ opacity: 0, y: 24, scale: 0.97 }}
					transition={{ type: 'spring', stiffness: 420, damping: 32 }}
					className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 sm:gap-3 rounded-full bg-primary text-primary-foreground px-4 py-2 shadow-xl border border-primary-foreground/10"
				>
					<span className="text-xs font-mono tabular-nums font-medium px-1">
						{count} selected
					</span>

					<div className="h-4 w-px bg-primary-foreground/20" />

					<Button
						type="button"
						variant="ghost"
						size="xs"
						disabled={isZipDownloading}
						onClick={onDownloadZip}
						className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
					>
						<FolderArchive className="size-3.5" aria-hidden="true" />
						<span>{isZipDownloading ? 'Zipping…' : 'Download ZIP'}</span>
					</Button>

					<Button
						type="button"
						variant="ghost"
						size="xs"
						onClick={onMove}
						className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
					>
						<FolderInput className="size-3.5" aria-hidden="true" />
						<span>Move</span>
					</Button>

					<Button
						type="button"
						variant="ghost"
						size="xs"
						onClick={onDelete}
						className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
					>
						<Trash2 className="size-3.5" aria-hidden="true" />
						<span>Delete</span>
					</Button>

					<button
						type="button"
						aria-label="Clear selection"
						onClick={onClear}
						className="p-1 rounded-full text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground"
					>
						<X className="size-3.5" aria-hidden="true" />
					</button>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
