import { expect, test } from '@playwright/test';

test('fails clearly when browser configuration is absent', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Konfigurasi belum siap' })).toBeVisible();
  await expect(page.getByText('Jangan gunakan service-role key di browser.')).toBeVisible();
});
