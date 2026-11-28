import { expect, test } from '@playwright/test';

test.describe('Kinko File Manager UI (#33-#43)', () => {
	test('navigates seeded vault, toggles grid/list, navigates breadcrumbs, uploads a file, creates/renames/moves/multi-selects/deletes', async ({
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
		await expect(
			page.getByRole('heading', { name: 'Welcome back' }),
		).toBeVisible({ timeout: 15_000 });

		await page.getByLabel('Email Address').fill('demo@kinko.app');
		await page.getByLabel('Password', { exact: true }).fill('KinkoVault#2026');
		await page.getByRole('button', { name: 'Sign In' }).click();

		// Ensure we land on /files with seeded Studio workspace
		await expect(page).toHaveURL(/\/files/, { timeout: 15_000 });
		await expect(page.getByText('01 Brand & Design')).toBeVisible({
			timeout: 15_000,
		});
		await expect(
			page.getByText('Q4-Product-Architecture-Brief.pdf'),
		).toBeVisible();

		// Toggle List view and confirm persistence across reload (#35)
		await page.getByRole('button', { name: 'List view' }).click();
		await expect(page.getByRole('table')).toBeVisible();
		await page.reload();
		await expect(page.getByRole('table')).toBeVisible({ timeout: 15_000 });

		// Switch back to Grid view
		await page.getByRole('button', { name: 'Grid view' }).click();
		await expect(page.getByRole('table')).toBeHidden();

		// Breadcrumb & nested folder navigation (#36)
		await page.getByRole('link', { name: /01 Brand & Design/ }).click();
		await expect(page.getByText('Identity Guidelines')).toBeVisible({
			timeout: 10_000,
		});
		await page.getByRole('link', { name: /Identity Guidelines/ }).click();
		await expect(page.getByText('kinko-brand-mark.svg')).toBeVisible({
			timeout: 10_000,
		});
		await page
			.getByRole('navigation', { name: 'Folder breadcrumbs' })
			.getByRole('link', { name: 'Vault Root' })
			.click();
		await expect(page).toHaveURL(/\/files$/, { timeout: 10_000 });
		await expect(
			page.getByRole('link', { name: /01 Brand & Design/ }),
		).toBeVisible({
			timeout: 10_000,
		});

		// Create & rename a folder (#40)
		const ts = Date.now();
		const folderName = `E2E-Folder-${ts}`;
		const renamedFolder = `E2E-Renamed-${ts}`;

		await page.getByRole('button', { name: 'New Folder' }).click();
		const folderDialog = page.getByRole('dialog');
		await expect(folderDialog).toBeVisible();
		await folderDialog.getByLabel('Folder Name').fill(folderName);
		await folderDialog.getByLabel('Folder Name').press('Enter');
		await expect(
			page.getByRole('link', { name: new RegExp(folderName) }),
		).toBeVisible({ timeout: 10_000 });

		await page
			.getByRole('button', { name: `Actions for ${folderName}` })
			.click();
		await page.getByRole('menuitem', { name: 'Rename' }).click();
		await page.getByLabel('Name', { exact: true }).fill(renamedFolder);
		await page.getByRole('button', { name: 'Save Name' }).click();
		await expect(
			page.getByRole('link', { name: new RegExp(renamedFolder) }),
		).toBeVisible({
			timeout: 10_000,
		});

		// File picker upload directly to Neon Object Storage (#37, #39)
		const uploadedName = `e2e-upload-${ts}.txt`;
		const fileInput = page.getByLabel('Choose files to upload');
		await fileInput.setInputFiles({
			name: uploadedName,
			mimeType: 'text/plain',
			buffer: Buffer.from(`Kinko E2E file upload ${ts}`, 'utf8'),
		});

		await expect(
			page.getByRole('complementary', { name: 'Upload queue' }),
		).toBeVisible();
		await expect(page.getByText(uploadedName).first()).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByText(/· Uploaded$/)).toBeVisible({
			timeout: 15_000,
		});

		// Move uploaded file into renamedFolder (#40)
		await page
			.getByRole('button', { name: `Actions for ${uploadedName}` })
			.click();
		await page.getByRole('menuitem', { name: 'Move', exact: true }).click();
		await page
			.getByRole('dialog')
			.getByRole('button', { name: renamedFolder })
			.click();
		await page.getByRole('button', { name: 'Move Here' }).click();
		await expect(
			page.getByRole('button', { name: `Actions for ${uploadedName}` }),
		).toBeHidden({ timeout: 10_000 });

		// Sorting toggle (#42)
		await page.getByRole('button', { name: /Sort direction:/ }).click();
		await expect(page).toHaveURL(/order=desc/);

		// Multi-selection & bulk delete of temporary E2E folder (#41)
		await page.getByRole('checkbox', { name: `Select ${renamedFolder}` }).click();
		const selectionBar = page.getByRole('region', {
			name: 'Bulk selection actions',
		});
		await expect(selectionBar).toBeVisible();
		await expect(selectionBar.getByText('1 selected')).toBeVisible();
		await selectionBar.getByRole('button', { name: 'Delete' }).click();
		await page
			.getByRole('dialog')
			.getByRole('button', { name: 'Move to Trash' })
			.click();
		await expect(
			page.getByRole('link', { name: new RegExp(renamedFolder) }),
		).toBeHidden({
			timeout: 10_000,
		});

		expect(pageErrors).toEqual([]);
		const unexpectedErrors = consoleErrors.filter(
			(msg) => !msg.includes('401') && !msg.includes('status of 401'),
		);
		expect(unexpectedErrors).toEqual([]);
	});
});
