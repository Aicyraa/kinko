import { expect, test } from '@playwright/test';

test.describe('Kinko Dashboard Overview & Analytics (#55-#62)', () => {
	test('renders storage card, KPI counts, Recharts storage & file-type charts, recent files preview, and activity feed', async ({
		page,
	}) => {
		const consoleErrors: string[] = [];
		const pageErrors: string[] = [];

		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});
		page.on('pageerror', (err) => pageErrors.push(err.message));

		await page.goto('/signin');
		await page.waitForLoadState('networkidle');
		await page.getByLabel('Email Address').fill('demo@kinko.app');
		await page.getByLabel('Password', { exact: true }).fill('KinkoVault#2026');
		await page.getByRole('button', { name: 'Sign In' }).click();
		await expect(page).toHaveURL(/\/files/, { timeout: 15_000 });

		// Navigate to Overview (/dashboard)
		await page.getByRole('link', { name: 'Overview' }).click();
		await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

		await expect(
			page.getByRole('heading', { name: /Overview/ }),
		).toBeVisible({ timeout: 15_000 });

		// Storage usage card & progressbar (#56)
		await expect(page.getByText('Vault Storage Capacity')).toBeVisible();
		await expect(
			page.getByRole('progressbar', { name: 'Vault storage usage' }),
		).toBeVisible();

		// KPI cards (#57, #58)
		const metrics = page.getByRole('region', { name: 'Workspace metrics' });
		await expect(metrics.getByText('Files')).toBeVisible();
		await expect(metrics.getByText('Folders')).toBeVisible();
		await expect(metrics.getByText('Total Uploads')).toBeVisible();
		await expect(metrics.getByText('Total Downloads')).toBeVisible();

		// Recharts charts (#59, #60)
		await expect(page.getByText('Storage Usage Trend')).toBeVisible();
		await page.getByRole('button', { name: '7D' }).click();
		await expect(
			page.getByRole('button', { name: '7D', pressed: true }),
		).toBeVisible();
		await expect(page.getByText('File Type Distribution')).toBeVisible();

		// Recent Files & Recent Activity (#61, #62)
		await expect(
			page.getByRole('heading', { name: 'Recent Files' }),
		).toBeVisible();
		await expect(
			page.getByRole('heading', { name: 'Recent Activity' }),
		).toBeVisible();

		expect(pageErrors).toEqual([]);
		const unexpectedErrors = consoleErrors.filter(
			(msg) => !msg.includes('401') && !msg.includes('status of 401'),
		);
		expect(unexpectedErrors).toEqual([]);
	});
});
