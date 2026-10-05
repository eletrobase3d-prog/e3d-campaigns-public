const assert = require('node:assert/strict');
module.exports = async ({ browser, webBase, jwt, f, db }) => {
  const original = await db.campaign.findUniqueOrThrow({ where: { id: f.campaign.id } });
  try {
    for (const timezoneId of ['UTC', 'Asia/Tokyo', 'America/New_York']) {
      await db.campaign.update({ where: { id: original.id }, data: {
        startsAt: new Date('2026-01-01T01:02:03.456Z'), endsAt: new Date('2030-01-01T02:30:00.123Z'),
      } });
      const context = await browser.newContext({ timezoneId });
      try {
        await context.addCookies([{ name: 'e3d_token', value: jwt, url: webBase }]);
        const page = await context.newPage();
        await page.goto(webBase + `/campaigns/${original.id}`);
        assert.equal(await page.getByLabel('Início (UTC−3)', { exact: true }).inputValue(), '2025-12-31T22:02:03.456');
        assert.equal(await page.getByLabel('Fim (UTC−3)', { exact: true }).inputValue(), '2029-12-31T23:30:00.123');
        await page.getByRole('columnheader', { name: 'Elegível a partir de (UTC−3)' }).waitFor();
        await page.getByRole('button', { name: 'Salvar configurações', exact: true }).click();
        await page.getByText('Campanha atualizada.', { exact: true }).last().waitFor();
        let saved = await db.campaign.findUniqueOrThrow({ where: { id: original.id } });
        assert.equal(saved.startsAt.toISOString(), '2026-01-01T01:02:03.456Z');
        assert.equal(saved.endsAt.toISOString(), '2030-01-01T02:30:00.123Z');
        assert.equal(saved.timezone, original.timezone);
        await page.getByLabel('Fim (UTC−3)', { exact: true }).fill('2030-12-31T23:30');
        const response = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().endsWith(`/api/campaigns/${original.id}`));
        await page.getByRole('button', { name: 'Salvar configurações', exact: true }).click();
        assert.equal((await response).status(), 200);
        saved = await db.campaign.findUniqueOrThrow({ where: { id: original.id } });
        assert.equal(saved.endsAt.toISOString(), '2031-01-01T02:30:00.000Z');
      } finally { await context.close(); }
    }
    console.log('Browser: fixed UTC-3 verified in UTC, Tokyo and New York; exact instants preserved.');
  } finally {
    await db.campaign.update({ where: { id: original.id }, data: { startsAt: original.startsAt, endsAt: original.endsAt } });
  }
};
