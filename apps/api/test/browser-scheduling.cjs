const assert = require('node:assert/strict');
module.exports = async ({ browser, webBase, jwt, f, db }) => {
  const original = await db.campaign.findUniqueOrThrow({ where: { id: f.campaign.id } });
  const context = await browser.newContext({ timezoneId: 'Asia/Tokyo' });
  try {
    await db.campaign.update({ where: { id: original.id }, data: { status: 'DRAFT', startsAt: new Date(Date.now() + 86400000), endsAt: null } });
    await context.addCookies([{ name: 'e3d_token', value: jwt, url: webBase }]);
    const page = await context.newPage(); page.on('dialog', dialog => dialog.accept());
    await page.goto(webBase + `/campaigns/${original.id}`);
    await page.getByRole('button', { name: 'Agendar início', exact: true }).click();
    await page.getByText('Início agendado.', { exact: true }).last().waitFor();
    await page.getByRole('button', { name: 'Desfazer agendamento', exact: true }).waitFor();
    assert.equal((await db.campaign.findUniqueOrThrow({ where: { id: original.id } })).status, 'SCHEDULED');
    await page.getByText(/Início agendado: .*UTC−3/).waitFor();
    const publicPage = await context.newPage();
    await publicPage.goto(webBase + `/c/~${original.id}`);
    await publicPage.getByText(/Campanha agendada para .*UTC−3/).waitFor();
    assert.equal(await publicPage.getByRole('button', { name: 'Participar agora' }).count(), 0);
    await publicPage.close();
    await page.getByRole('button', { name: 'Desfazer agendamento', exact: true }).click();
    await page.getByText('Agendamento desfeito. Campanha pausada.', { exact: true }).last().waitFor();
    await page.getByRole('button', { name: 'Agendar início', exact: true }).waitFor();
    assert.equal((await db.campaign.findUniqueOrThrow({ where: { id: original.id } })).status, 'PAUSED');
    await db.organizationUser.updateMany({ where: { userId: f.actor.sub }, data: { role: 'ANALYST' } });
    await page.reload();
    assert.equal(await page.getByRole('button', { name: 'Agendar início', exact: true }).count(), 0);
    console.log('Browser: schedule/undo, public UTC-3 date, closed registration and analyst restrictions passed.');
  } finally {
    await context.close();
    await db.organizationUser.updateMany({ where: { userId: f.actor.sub }, data: { role: 'OWNER' } });
    await db.campaign.update({ where: { id: original.id }, data: { status: original.status, startsAt: original.startsAt, endsAt: original.endsAt } });
  }
};
