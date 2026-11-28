import { ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';

interface AuthShellProps {
	children: ReactNode;
}

export function AuthShell({ children }: AuthShellProps) {
	return (
		<div className="min-h-screen bg-secondary text-foreground grid lg:grid-cols-12">
			{/* Left architectural brand panel */}
			<aside className="hidden lg:flex lg:col-span-5 flex-col justify-between bg-primary text-primary-foreground p-12 relative overflow-hidden">
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 opacity-[0.07]"
					style={{
						backgroundImage:
							'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
						backgroundSize: '48px 48px',
					}}
				/>

				<motion.div
					initial={{ opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
					className="relative z-10 flex items-center gap-3"
				>
					<div className="size-10 rounded-lg border border-primary-foreground/20 bg-primary-foreground/10 flex items-center justify-center">
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.75"
							aria-hidden="true"
						>
							<rect x="3" y="3" width="18" height="18" rx="3" />
							<circle cx="12" cy="12" r="3.5" />
							<path d="M12 5.5v3M12 15.5v3M5.5 12h3M15.5 12h3" />
						</svg>
					</div>
					<div>
						<span translate="no" className="text-lg font-semibold tracking-tight">
							Kinko
						</span>
						<span className="block text-xs text-primary-foreground/60 font-mono">
							金庫 · CLOUD VAULT
						</span>
					</div>
				</motion.div>

				<motion.div
					initial={{ opacity: 0, y: 16 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.55, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
					className="relative z-10 space-y-6 max-w-md"
				>
					<h1 className="text-3xl font-semibold tracking-tight leading-tight text-balance">
						Architectural file storage built for isolated teams.
					</h1>
					<p className="text-sm leading-relaxed text-primary-foreground/75 text-pretty">
						Every workspace is tenant-isolated at the database and object-storage
						boundary with presigned transfers, versioned metadata, and full
						audit trails.
					</p>

					<div className="pt-4 border-t border-primary-foreground/15 grid grid-cols-2 gap-4 text-xs">
						<div>
							<div className="font-mono text-primary-foreground/60">STORAGE</div>
							<div className="mt-1 font-medium">Direct Presigned S3</div>
						</div>
						<div>
							<div className="font-mono text-primary-foreground/60">ISOLATION</div>
							<div className="mt-1 font-medium">Per-Tenant RBAC</div>
						</div>
					</div>
				</motion.div>

				<div className="relative z-10 flex items-center gap-2 text-xs text-primary-foreground/60">
					<ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
					<span>Zero-knowledge metadata separation via Neon &amp; S3</span>
				</div>
			</aside>

			{/* Right interactive auth panel */}
			<main className="lg:col-span-7 flex flex-col items-center justify-center p-6 sm:p-10">
				<div className="w-full max-w-md">{children}</div>
			</main>
		</div>
	);
}
