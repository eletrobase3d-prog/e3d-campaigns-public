const assert = require('node:assert/strict');
module.exports = async ({ browser, webBase, jwt, f }) => {
  const context = await browser.newContext();
  try {
    await context.addCookies([{ name: 'e3d_token', value: jwt, url: webBase }]);
    const page = await context.newPage();
    await page.goto(webBase + `/campaigns/${f.campaign.id}`);
    const source = page.url(); const expected = webBase + `/c/~${f.campaign.id}`;
    const button = page.getByRole('button', { name: 'Gerar link de indicação', exact: true });
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: value => { window.copiedAddress = value; return new Promise(resolve => { window.finishCopy = resolve; }); },
    } }));
    const popupEvent = page.waitForEvent('popup');
    await button.click();
    const popup = await popupEvent;
    await popup.waitForURL(expected);
    assert.equal(await popup.evaluate(() => window.opener), null);
    assert.equal(page.url(), source);
    assert.equal(await page.evaluate(() => window.copiedAddress), expected);
    assert.equal(await page.getByText('Link copiado!', { exact: true }).count(), 0);
    assert.equal(await button.isDisabled(), true);
    await page.evaluate(() => window.finishCopy());
    await page.getByText('Link copiado!', { exact: true }).last().waitFor();
    assert.equal(await page.getByLabel('Link público da campanha').inputValue(), expected);
    assert.equal(await page.getByRole('link', { name: 'Abrir página' }).getAttribute('href'), expected);
    await popup.close();
    // Blocked popup must not turn successful copying into a false failure.
    await page.evaluate(() => {
      window.open = () => null;
      navigator.clipboard.writeText = async () => {};
    });
    await button.click();
    await page.getByText('Link copiado! Não foi possível abrir a nova aba. Use Abrir página.', { exact: true }).last().waitFor();
    await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw Error('Denied'); }; });
    await button.click();
    await page.getByText('Não foi possível copiar automaticamente. Copie o endereço abaixo. Não foi possível abrir a nova aba. Use Abrir página.', { exact: true }).last().waitFor();
    assert.equal(await button.isEnabled(), true);
    // Missing clipboard API is handled too.
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
    await button.click();
    assert.equal(await page.getByLabel('Link público da campanha').inputValue(), expected);
    assert.equal(page.url(), source);
    console.log('Browser: campaign link opens isolated tab, copies canonical address and handles deferred success/denial/popup block.');
  } finally { await context.close(); }
};
