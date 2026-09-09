import { expect, test } from '@playwright/test';

test('mobile primary daily navigation fits viewport without horizontal document overflow', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  const nav = page.locator('.daily-nav');
  if (await nav.count() === 0) test.skip(true, 'Authenticated shell is not available in the ordinary fixture lane');
  await expect(nav).toBeVisible();
  for (const label of ['Hari ini','Mengajar','Koreksi cepat','Penilaian','Laporan']) await expect(nav.getByRole('button', { name: label, exact: true })).toBeVisible();
  const geometry = await nav.evaluate(el => ({ clientWidth: el.clientWidth, scrollWidth: el.scrollWidth }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
});
