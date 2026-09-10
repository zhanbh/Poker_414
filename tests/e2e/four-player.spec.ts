import { expect, test } from '@playwright/test';

test('四个桌面浏览器完成邀请登录、入房和开局', async ({ browser }) => {
  const contexts = await Promise.all([1, 2, 3, 4].map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((context) => context.newPage()));

  await Promise.all(pages.map(async (page, index) => {
    await page.goto('/');
    await page.getByLabel('邀请码').fill('inner-414');
    await page.getByLabel('昵称').fill(['甲', '乙', '丙', '丁'][index]);
    await page.getByRole('button', { name: '进入房间' }).click();
    await expect(page.getByText('等待开局')).toBeVisible();
  }));

  let hostPage = pages[0];
  for (const page of pages) {
    if (await page.getByRole('button', { name: '开始游戏' }).count()) {
      hostPage = page;
      break;
    }
  }
  await expect(hostPage.getByRole('button', { name: '开始游戏' })).toBeEnabled();
  await hostPage.getByRole('button', { name: '开始游戏' }).click();
  await expect(hostPage.getByText(/本手主/)).toBeVisible();

  await Promise.all(contexts.map((context) => context.close()));
});
