import { expect, test } from '@playwright/test';

test.describe('Kinko Auth & Workspace Onboarding (#16, #19, #33)', () => {
	test('renders White/Carbon sign-in UI, handles invalid login, signs up, persists session across reload, creates workspace, and signs out', async ({
		page,
	}) => {
		const consoleErrors: string[] = [];
		const pageErrors: string[] = [];

		page.on('console', (msg) => {
			if (msg.type() === 'error') {
				consoleErrors.push(msg.text());
			}
		});
		page.on('pageerror', (err) => {
			pageErrors.push(err.message);
		});

		await page.goto('/');
		await page.waitForLoadState('networkidle');
		await expect(
			page.getByRole('heading', { name: 'Welcome back' }),
		).toBeVisible({ timeout: 15_000 });

		// Invalid sign-in shows clean alert without crashing
		await page.getByLabel('Email Address').fill('nonexistent@kinko.test');
		await page.getByLabel('Password', { exact: true }).fill('WrongPass123!');
		await page.getByRole('button', { name: 'Sign In' }).click();
		await expect(page.getByRole('alert')).toBeVisible();

		// Switch to Create Account
		await page.getByRole('tab', { name: 'Create Account' }).click();
		await expect(
			page.getByRole('heading', { name: 'Create your vault' }),
		).toBeVisible();

		const uniqueId = Date.now();
		const testEmail = `e2e-${uniqueId}@kinko.test`;
		await page.getByLabel('Full Name').fill('E2E Vault User');
		await page.getByLabel('Email Address').fill(testEmail);
		await page.getByLabel('Password', { exact: true }).fill('KinkoVault#2026');
		await page.getByLabel('Confirm Password').fill('KinkoVault#2026');
		await page.getByRole('button', { name: 'Create Account' }).click();

		// Should land on /files with default tenant provisioned in the sidebar
		await expect(page).toHaveURL(/\/files/, { timeout: 15_000 });
		await expect(
			page.getByRole('heading', { name: "E2E Vault User's Vault" }),
		).toBeVisible({ timeout: 15_000 });

		// Create a second workspace via sidebar workspace switcher
		await page.getByRole('button', { name: 'Switch workspace' }).click();
		await page.getByRole('menuitem', { name: 'New Workspace' }).click();
		await page.getByLabel('Workspace Name').fill('Studio Archive');
		await page.getByRole('button', { name: 'Create Workspace' }).click();
		await expect(
			page.getByRole('heading', { name: 'Studio Archive' }),
		).toBeVisible({ timeout: 10_000 });

		// Reload and confirm session survives
		await page.reload();
		await expect(
			page.getByRole('heading', { name: 'Studio Archive' }),
		).toBeVisible({ timeout: 15_000 });

		// Sign out and confirm reload stays unauthenticated
		await page.getByRole('button', { name: 'Sign Out' }).click();
		await expect(
			page.getByRole('heading', { name: 'Welcome back' }),
		).toBeVisible({ timeout: 15_000 });
		await page.reload();
		await expect(
			page.getByRole('heading', { name: 'Welcome back' }),
		).toBeVisible({ timeout: 15_000 });

		expect(pageErrors).toEqual([]);
		const unexpectedErrors = consoleErrors.filter(
			(msg) => !msg.includes('401') && !msg.includes('status of 401'),
		);
		expect(unexpectedErrors).toEqual([]);
	});
});
