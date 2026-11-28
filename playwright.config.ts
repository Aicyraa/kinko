import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './e2e',
	fullyParallel: false,
	retries: 0,
	timeout: 30_000,
	use: {
		baseURL: 'http://localhost:5173',
		headless: true,
		launchOptions: {
			executablePath: '/usr/bin/chromium',
		},
		trace: 'on-first-retry',
	},
});
