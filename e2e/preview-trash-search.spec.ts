import { expect, test } from '@playwright/test';

test.describe('Kinko Inline Previews, Trash & Search (#44-#54)', () => {
	test('previews PDF, image, text/code, and audio; searches with filters; restores and permanently deletes from trash', async ({
		page,
	}) => {
		const consoleErrors: string[] = [];
		const pageErrors: string[] = [];

		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});
		page.on('pageerror', (err) => pageErrors.push(err.message));

		// Sign in as seeded demo account
		await page.goto('/signin');
		await page.waitForLoadState('networkidle');
		await page.getByLabel('Email Address').fill('demo@kinko.app');
		await page.getByLabel('Password', { exact: true }).fill('KinkoVault#2026');
		await page.getByRole('button', { name: 'Sign In' }).click();
		await expect(page).toHaveURL(/\/files/, { timeout: 15_000 });

		// 1. PDF Preview (#45)
		await page
			.getByRole('button', {
				name: 'Q4-Product-Architecture-Brief.pdf',
				exact: true,
			})
			.click();
		const previewDialog = page.getByRole('dialog');
		await expect(previewDialog).toBeVisible();
		await expect(
			previewDialog.locator('iframe[title="Q4-Product-Architecture-Brief.pdf"]'),
		).toBeVisible({ timeout: 15_000 });
		await previewDialog.getByRole('button', { name: 'Close preview' }).click();

		// 2. Image Preview (#44)
		await page.getByRole('link', { name: /01 Brand & Design/ }).click();
		await page
			.getByRole('button', { name: 'vault-grid-preview.png', exact: true })
			.click();
		await expect(previewDialog.locator('img[alt="vault-grid-preview.png"]')).toBeVisible({
			timeout: 15_000,
		});
		await previewDialog.getByRole('button', { name: 'Zoom in' }).click();
		await expect(previewDialog.getByText('125%')).toBeVisible();
		await previewDialog.getByRole('button', { name: 'Close preview' }).click();

		// 3. Text/Code Preview (#46)
		await page
			.getByRole('navigation', { name: 'Folder breadcrumbs' })
			.getByRole('link', { name: 'Vault Root' })
			.click();
		await expect(page).toHaveURL(/\/files$/);
		await page.getByRole('link', { name: /02 Engineering Specs/ }).click();
		await page
			.getByRole('button', { name: 'api-contract.ts', exact: true })
			.click();
		await expect(previewDialog.getByText(/interface VaultFile/)).toBeVisible({
			timeout: 15_000,
		});
		await previewDialog.getByRole('button', { name: 'Close preview' }).click();

		// 4. Audio Preview (#47)
		await page
			.getByRole('navigation', { name: 'Folder breadcrumbs' })
			.getByRole('link', { name: 'Vault Root' })
			.click();
		await expect(page).toHaveURL(/\/files$/);
		await page.getByRole('link', { name: /03 Media Assets/ }).click();
		await page
			.getByRole('button', { name: 'vault-chime.wav', exact: true })
			.click();
		await expect(previewDialog.locator('audio')).toBeVisible({ timeout: 15_000 });
		await previewDialog.getByRole('button', { name: 'Close preview' }).click();

		// 5. Search with filename & type filters (#52-#54)
		await page.getByRole('link', { name: 'Search' }).click();
		await expect(page).toHaveURL(/\/search/);
		await page.getByLabel('Filename').fill('architecture');
		await expect(
			page.getByRole('button', {
				name: 'Q4-Product-Architecture-Brief.pdf',
				exact: true,
			}),
		).toBeVisible({ timeout: 10_000 });
		await expect(page.getByText(/1 result$/)).toBeVisible();

		await page.getByRole('button', { name: 'Reset Filters' }).click();
		await expect(
			page.getByRole('button', { name: 'api-contract.ts', exact: true }),
		).toBeVisible({
			timeout: 10_000,
		});

		// 6. Trash: upload disposable file -> soft-delete -> restore -> soft-delete -> delete forever (#48-#50)
		await page.getByRole('link', { name: 'Files' }).click();
		await expect(page).toHaveURL(/\/files$/);

		const ts = Date.now();
		const tempName = `e2e-trash-${ts}.txt`;
		await page.getByLabel('Choose files to upload').setInputFiles({
			name: tempName,
			mimeType: 'text/plain',
			buffer: Buffer.from(`Disposable trash test ${ts}`, 'utf8'),
		});
		await expect(
			page.getByRole('button', { name: `Actions for ${tempName}` }),
		).toBeVisible({ timeout: 15_000 });

		// Soft-delete
		await page.getByRole('button', { name: `Actions for ${tempName}` }).click();
		await page.getByRole('menuitem', { name: 'Move to Trash' }).click();
		await page
			.getByRole('dialog')
			.getByRole('button', { name: 'Move to Trash' })
			.click();
		await expect(
			page.getByRole('button', { name: `Actions for ${tempName}` }),
		).toBeHidden({ timeout: 10_000 });

		// Go to Trash -> verify seeded trashed file + tempName -> restore tempName
		await page.getByRole('link', { name: 'Trash' }).click();
		await expect(page).toHaveURL(/\/trash/);
		await expect(
			page.getByText('Q3-Board-Draft-Deprecated.pdf'),
		).toBeVisible({ timeout: 10_000 });
		const tempRow = page.getByRole('row', { name: new RegExp(tempName) });
		await expect(tempRow).toBeVisible();
		await tempRow.getByRole('button', { name: 'Restore' }).click();
		await expect(tempRow).toBeHidden({ timeout: 10_000 });

		// Verify restored in /files, then soft-delete again and Delete Forever
		await page.getByRole('link', { name: 'Files' }).click();
		await expect(
			page.getByRole('button', { name: `Actions for ${tempName}` }),
		).toBeVisible({ timeout: 10_000 });
		await page.getByRole('button', { name: `Actions for ${tempName}` }).click();
		await page.getByRole('menuitem', { name: 'Move to Trash' }).click();
		await page
			.getByRole('dialog')
			.getByRole('button', { name: 'Move to Trash' })
			.click();
		await expect(
			page.getByRole('button', { name: `Actions for ${tempName}` }),
		).toBeHidden({ timeout: 10_000 });

		await page.getByRole('link', { name: 'Trash' }).click();
		const tempRowAgain = page.getByRole('row', { name: new RegExp(tempName) });
		await expect(tempRowAgain).toBeVisible({ timeout: 10_000 });
		await tempRowAgain.getByRole('button', { name: 'Delete Forever' }).click();
		await page
			.getByRole('dialog')
			.getByRole('button', { name: 'Delete Forever' })
			.click();
		await expect(tempRowAgain).toBeHidden({ timeout: 10_000 });

		expect(pageErrors).toEqual([]);
		const unexpectedErrors = consoleErrors.filter(
			(msg) => !msg.includes('401') && !msg.includes('status of 401'),
		);
		expect(unexpectedErrors).toEqual([]);
	});
});
