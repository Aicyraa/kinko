import { expect, test } from '@playwright/test';

test.describe('Kinko Auth & Workspace Onboarding (#16, #19)', () => {
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

		// Should land on Your Workspaces with default tenant provisioned
		await expect(
			page.getByRole('heading', { name: 'Your Workspaces' }),
		).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText("E2E Vault User's Vault")).toBeVisible();

		// Create a second workspace
		await page.getByRole('button', { name: 'New Workspace' }).click();
		await page.getByLabel('Workspace Name').fill('Studio Archive');
		await page.getByRole('button', { name: 'Create Workspace' }).click();
		await expect(
			page.getByRole('heading', { name: 'Studio Archive' }),
		).toBeVisible();

		// Reload and confirm session survives
		await page.reload();
		await expect(
			page.getByRole('heading', { name: 'Your Workspaces' }),
		).toBeVisible({ timeout: 15_000 });
		await expect(
			page.getByRole('heading', { name: 'Studio Archive' }),
		).toBeVisible();

		// Sign out and confirm reload stays unauthenticated
		await page.getByRole('button', { name: 'Sign Out' }).click();
		await expect(
			page.getByRole('heading', { name: 'Welcome back' }),
		).toBeVisible({ timeout: 15_000 });
		await page.reload();
		await expect(
			page.getByRole('heading', { name: 'Welcome back' }),
		).toBeVisible();

		expect(pageErrors).toEqual([]);
		// Filter out expected 401/422 network console noise from the invalid sign-in test
		const unexpectedErrors = consoleErrors.filter(
			(msg) => !msg.includes('401') && !msg.includes('status of 401'),
		);
		expect(unexpectedErrors).toEqual([]);
	});
});
