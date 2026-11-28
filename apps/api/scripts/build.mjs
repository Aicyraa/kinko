import { rmSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

rmSync('dist', { recursive: true, force: true });

await build({
	entryPoints: ['src/index.ts'],
	bundle: true,
	platform: 'node',
	target: 'node24',
	format: 'esm',
	outfile: 'dist/index.js',
	banner: {
		js: "import { createRequire as __kinkoCreateRequire } from 'node:module'; const require = __kinkoCreateRequire(import.meta.url);",
	},
	external: ['pino-pretty'],
});

writeFileSync('dist/package.json', `${JSON.stringify({ type: 'module' })}\n`);
