import { expect, test } from '@playwright/test';

test('loads the Phaser WebGL scene and representative atlas workload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#renderer')).toHaveText('WebGL');
  await expect(page.locator('#atlas')).toContainText('19 frames');
  await expect(page.locator('#game canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('keeps the semantic shell operable in portrait', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Forest Rescue mobile stack check' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume audio + beep' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start 60s performance run' })).toBeVisible();
  await expect(page.locator('#game canvas')).toBeVisible();
});
