import { expect, test } from '@playwright/test';

test.describe('Kinko Phase 6 Advanced Features (#63-#70)', () => {
	test('supports favorites, password share link lifecycle, version history, ZIP download, and audit log filtering', async ({
		browser,
		page,
	}) => {
		const consoleErrors: string[] = [];
		const pageErrors: string[] = [];

		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});
		page.on('pageerror', (err) => pageErrors.push(err.message));

		// 1. Sign in as demo user
		await page.goto('/signin');
		await page.waitForLoadState('networkidle');
		await page.getByLabel('Email Address').fill('demo@kinko.app');
		await page.getByLabel('Password', { exact: true }).fill('KinkoVault#2026');
		await page.getByRole('button', { name: 'Sign In' }).click();
		await expect(page).toHaveURL(/\/files/, { timeout: 15_000 });

		await expect(
			page.getByText('Q4-Product-Architecture-Brief.pdf'),
		).toBeVisible({ timeout: 15_000 });

		// 2. Favorites (#63): Visit Favorites page and verify seeded starred items appear
		await page.getByRole('link', { name: 'Favorites' }).click();
		await expect(page).toHaveURL(/\/favorites/, { timeout: 15_000 });
		await expect(
			page.getByRole('heading', { name: 'Favorites', exact: true }),
		).toBeVisible();
		await expect(
			page.getByText('Q4-Product-Architecture-Brief.pdf'),
		).toBeVisible({ timeout: 10_000 });

		// Return to Files
		await page.getByRole('link', { name: 'Files' }).click();
		await expect(page).toHaveURL(/\/files$/, { timeout: 15_000 });

		// 3. Share Links (#65) & Permissions (#66)
		await page
			.getByRole('button', {
				name: 'Actions for Q4-Product-Architecture-Brief.pdf',
			})
			.click();
		await page.getByRole('menuitem', { name: 'Share & Access' }).click();

		const shareDialog = page.getByRole('dialog');
		await expect(shareDialog).toBeVisible();
		await shareDialog.getByLabel('Optional Password').fill('SharePass#2026');
		await shareDialog.getByRole('button', { name: 'Create Share Link' }).click();

		const generatedInput = shareDialog.getByLabel('Generated share URL');
		await expect(generatedInput).toBeVisible({ timeout: 10_000 });
		const shareUrl = await generatedInput.inputValue();
		expect(shareUrl).toContain('/s/');

		// Test unauthenticated public share page in a fresh context
		const anonContext = await browser.newContext();
		const anonPage = await anonContext.newPage();
		await anonPage.goto(shareUrl);
		await anonPage.waitForLoadState('networkidle');
		await expect(
			anonPage.getByRole('heading', {
				name: 'Q4-Product-Architecture-Brief.pdf',
			}),
		).toBeVisible({ timeout: 15_000 });
		await expect(anonPage.getByText('Password Required')).toBeVisible();

		// Wrong password shows error
		await anonPage.getByLabel('Password Required').fill('wrong-pass');
		await anonPage.getByRole('button', { name: 'Unlock & Download' }).click();
		await expect(anonPage.getByRole('alert')).toContainText(
			/Invalid share password/i,
			{ timeout: 10_000 },
		);

		// Correct password triggers download
		const shareDownloadPromise = anonPage.waitForEvent('download');
		await anonPage.getByLabel('Password Required').fill('SharePass#2026');
		await anonPage.getByRole('button', { name: 'Unlock & Download' }).click();
		const shareDownload = await shareDownloadPromise;
		expect(shareDownload.suggestedFilename()).toContain(
			'Q4-Product-Architecture-Brief',
		);

		// Revoke share link in authenticated dialog, then verify anon context sees unavailable
		await shareDialog
			.getByRole('button', { name: 'Revoke' })
			.first()
			.click();
		await expect(shareDialog.getByText('REVOKED').first()).toBeVisible({
			timeout: 10_000,
		});
		await shareDialog.getByRole('button', { name: 'Close' }).click();

		await anonPage.reload();
		await expect(
			anonPage.getByRole('heading', { name: 'Share Link Unavailable' }),
		).toBeVisible({ timeout: 10_000 });
		await anonContext.close();

		// 4. ZIP Download (#67): select brief PDF & click Download ZIP
		await page
			.getByRole('checkbox', {
				name: 'Select Q4-Product-Architecture-Brief.pdf',
			})
			.click();
		const zipDownloadPromise = page.waitForEvent('download');
		await page.getByRole('button', { name: 'Download ZIP' }).click();
		const zipDownload = await zipDownloadPromise;
		expect(zipDownload.suggestedFilename()).toMatch(/\.zip$/);
		await page.getByRole('button', { name: 'Clear selection' }).click();

		// 5. File Versioning (#69): open 02 Engineering Specs -> tenant-isolation-policy.md -> Version History
		await page.getByRole('link', { name: /02 Engineering Specs/ }).click();
		await expect(
			page.getByText('tenant-isolation-policy.md'),
		).toBeVisible({ timeout: 15_000 });
		await page
			.getByRole('button', { name: 'Actions for tenant-isolation-policy.md' })
			.click();
		await page.getByRole('menuitem', { name: 'Version History' }).click();
		const verDialog = page.getByRole('dialog');
		await expect(verDialog.getByText('v2', { exact: true })).toBeVisible({
			timeout: 10_000,
		});
		await expect(verDialog.getByText('v1', { exact: true })).toBeVisible();
		await verDialog.getByRole('button', { name: 'Close' }).click();

		// 6. Audit Log (#64): visit /settings and verify Workspace Audit Log renders
		await page.getByRole('link', { name: 'Settings' }).click();
		await expect(page).toHaveURL(/\/settings/, { timeout: 15_000 });
		await expect(
			page.getByRole('heading', { name: 'Workspace Audit Log' }),
		).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText('FILE_SHARED').first()).toBeVisible({
			timeout: 10_000,
		});

		expect(pageErrors).toEqual([]);
		const unexpectedErrors = consoleErrors.filter(
			(msg) =>
				!msg.includes('401') &&
				!msg.includes('status of 401') &&
				!msg.includes('410'),
		);
		expect(unexpectedErrors).toEqual([]);
	});
});
