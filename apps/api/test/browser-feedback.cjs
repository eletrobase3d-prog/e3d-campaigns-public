const assert = require('node:assert/strict');

// Optional real-browser check. Point TEST_PLAYWRIGHT_MODULE to a Playwright installation.
// Uses only the disposable integration fixtures and loopback server supplied by the caller.
module.exports = async function checkFeedback({ webBase, jwt, f, r, review, row, score, db }) {
  const { chromium } = require(process.env.TEST_PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_CHANNEL ? { channel: process.env.TEST_BROWSER_CHANNEL } : {}) });
  try {
    const context = await browser.newContext();
    context.setDefaultTimeout(12000);
    context.setDefaultNavigationTimeout(12000);
    await context.addCookies([{ name: 'e3d_token', value: jwt, url: webBase }]);
    const page = await context.newPage();
    const message = async text => { await page.getByText(text, { exact: true }).last().waitFor(); };

    console.log('Browser: login feedback');
    await page.goto(webBase + '/login');
    await page.locator('[name=email]').fill('browser@example.invalid');
    await page.locator('[name=password]').fill(require('node:crypto').randomUUID());
    await page.route('**/api/session/login', route => route.abort());
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await message('Não foi possível confirmar a operação. Verifique a conexão antes de tentar novamente.');
    assert.equal(await page.getByRole('button', { name: 'Entrar', exact: true }).isEnabled(), true);
    await page.unroute('**/api/session/login');
    await page.route('**/api/session/login', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.waitForURL(webBase + '/');
    await message('Login realizado.');

    console.log('Browser: create campaign');
    await page.goto(webBase + '/campaigns/new');
    await page.locator('[name=name]').fill('Synthetic browser campaign');
    await page.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    await page.waitForURL(/\/campaigns\/[0-9a-f-]+$/);
    await message('Campanha criada.');

    console.log('Browser: reassessment');
    await review(f, r.id, 'INVALID');
    await page.goto(webBase + `/campaigns/${f.campaign.id}`);
    await page.getByRole('button', { name: 'Reavaliar', exact: true }).click();
    await message('Reavaliação aberta. Informe a justificativa para continuar.');
    await page.getByLabel(/Justificativa da reabertura/).fill('Synthetic browser reassessment');
    await page.getByRole('button', { name: 'Confirmar reabertura', exact: true }).click();
    await message('Indicação reaberta para análise manual. Ela ainda não pontua. Clique em Revisar para decidir.');
    assert.equal((await row(f)).manualReviewRequired, true);
    assert.equal(await score(f), 0);
    await page.getByRole('button', { name: 'Revisar', exact: true }).click();
    await page.getByLabel(/Motivo \(sem dados sensíveis\)/).fill('Synthetic browser approval');
    await page.getByRole('button', { name: 'Confirmar revisão', exact: true }).click();
    await message('Indicação aprovada. Pontuação atualizada.');
    assert.equal(await score(f), 1);
    await page.getByLabel('Filtrar por status').selectOption('ALL');
    await page.getByRole('button', { name: 'Histórico', exact: true }).click();
    await message('Histórico carregado.');
    await page.getByRole('button', { name: 'Fechar histórico', exact: true }).click();
    await message('Histórico fechado.');

    // Reproduce the reported sequence: reward feedback must not survive a referral action.
    await page.locator('[name=rewardTitle]').fill('Synthetic feedback reward');
    await page.getByRole('button', { name: 'Adicionar prêmio', exact: true }).click();
    await message('Prêmio adicionado.');
    await page.getByRole('button', { name: 'Revisar', exact: true }).click();
    assert.equal(await page.getByText('Prêmio adicionado.', { exact: true }).count(), 0);
    await page.getByLabel(/Motivo \(sem dados sensíveis\)/).fill('Synthetic invalidation from browser');
    await page.getByRole('button', { name: 'Confirmar revisão', exact: true }).click();
    await message('Indicação invalidada. Para corrigir essa decisão, clique em Reavaliar.');
    await page.getByRole('button', { name: 'Reavaliar', exact: true }).waitFor();
    assert.equal(await page.getByLabel('Filtrar por status').inputValue(), 'INVALID');
    assert.equal(await page.getByText('Prêmio adicionado.', { exact: true }).count(), 0);
    assert.equal(await score(f), 0);
    await page.getByRole('button', { name: 'Reavaliar', exact: true }).click();
    await page.getByLabel(/Justificativa da reabertura/).fill('Correcting browser invalidation');
    await page.getByRole('button', { name: 'Confirmar reabertura', exact: true }).click();
    await message('Indicação reaberta para análise manual. Ela ainda não pontua. Clique em Revisar para decidir.');
    assert.equal((await row(f)).status, 'PENDING');

    console.log('Browser: logout feedback');
    await page.goto(webBase + '/');
    await page.route('**/api/session/logout', route => route.fulfill({ status: 500, body: '{}' }));
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await message('Não foi possível confirmar a saída. Tente novamente.');
    assert.equal(await page.getByRole('button', { name: 'Sair', exact: true }).isEnabled(), true);
    await page.unroute('**/api/session/logout');
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await page.waitForURL(webBase + '/login');
    await message('Você saiu da sua conta.');

    console.log('Browser: clipboard feedback');
    await page.goto(webBase + `/c/${f.campaign.slug}`);
    await page.locator('[name=name]').fill('Synthetic clipboard participant');
    await page.locator('form button[type=submit], form button:not([type])').click();
    await message('Cadastro concluído!');
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: text => {
        window.testCopiedText = text;
        return new Promise(resolve => { window.testFinishCopy = resolve; });
      } } });
    });
    await page.getByRole('button', { name: 'Copiar link', exact: true }).click();
    assert.equal(await page.getByText('Link copiado! Agora é só colar e compartilhar.', { exact: true }).count(), 0);
    await page.evaluate(() => window.testFinishCopy());
    await message('Link copiado! Agora é só colar e compartilhar.');
    assert.ok((await page.evaluate(() => window.testCopiedText)).startsWith(webBase + '/'));
    await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('Denied'); }; });
    await page.getByRole('button', { name: /Copiado|Copiar link/ }).click();
    await message('Não foi possível copiar automaticamente. Selecione o link abaixo e copie manualmente.');
    assert.equal(await page.locator('input[readonly]').inputValue(), await page.evaluate(() => window.testCopiedText));
    console.log('Browser: referral identity, visible visit, retry and invalid attribution');
    const countClicks = () => db.referralClick.count({ where: { campaignId: f.campaign.id } });
    const beforeClicks = await countClicks();
    await context.request.get(webBase + `/r/~${f.first.participantId}`);
    assert.equal(await countClicks(), beforeClicks, 'HTTP rendering alone must not count a click');
    let firstEventId;
    let eventCalls = 0;
    await page.route('**/api/events', async route => {
      const payload = route.request().postDataJSON(); eventCalls++;
      if (eventCalls === 1) {
        firstEventId = payload.eventId;
        await route.fetch(); // Persist event, simulate losing only the response.
        await route.abort();
      } else {
        assert.equal(payload.eventId, firstEventId);
        await route.continue();
      }
    });
    const clickResponse = page.waitForResponse(response => response.url().endsWith('/api/events') && response.status() === 201);
    await page.goto(webBase + `/r/~${f.first.participantId}`);
    await clickResponse;
    await page.getByText('Participant Alpha', { exact: true }).waitFor();
    await page.getByText(f.first.referralCode, { exact: true }).waitFor();
    assert.equal(await countClicks(), beforeClicks + 1);
    assert.equal(eventCalls, 2);
    if (process.env.TEST_SCREENSHOT_DIR) {
      require('node:fs').mkdirSync(process.env.TEST_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: require('node:path').join(process.env.TEST_SCREENSHOT_DIR, 'referral-identity.png'), fullPage: true });
    }
    await page.unroute('**/api/events');
    await page.goto(webBase + `/c/~${f.campaign.id}?ref=NOT-A-VALID-CODE`);
    await page.getByRole('heading', { name: 'Indicação indisponível' }).waitFor();
    assert.equal(await page.locator('form').count(), 0);
    assert.equal(await countClicks(), beforeClicks + 1);
    // Tracking outage must leave the correctly attributed registration form usable.
    await page.route('**/api/events', route => route.fulfill({ status: 503, body: '{}' }));
    await page.goto(webBase + `/c/~${f.campaign.id}?ref=${f.first.referralCode}`);
    await page.getByText('Participant Alpha', { exact: true }).waitFor();
    assert.equal(await page.locator('[name=name]').isEnabled(), true);
    await page.unroute('**/api/events');
    await require('./browser-scheduling.cjs')({ browser, webBase, jwt, f, db });
    await require('./browser-campaign-link.cjs')({ browser, webBase, jwt, f });
    console.log('Browser: campaign conflict never announces success');
    await context.addCookies([{ name: 'e3d_token', value: jwt, url: webBase }]);
    await page.goto(webBase + `/campaigns/${f.campaign.id}`);
    const conflictRoute = async route => {
      if (route.request().method() === 'PATCH') return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'Operação concorrente. Tente novamente.' }) });
      return route.continue();
    };
    await page.route(`**/api/campaigns/${f.campaign.id}`, conflictRoute);
    await page.getByRole('button', { name: 'Salvar configurações', exact: true }).click();
    await message('Operação concorrente. Tente novamente.');
    assert.equal(await page.getByText('Campanha atualizada.', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Salvar configurações', exact: true }).isEnabled(), true);
    await page.unroute(`**/api/campaigns/${f.campaign.id}`, conflictRoute);
    await require('./browser-timezones.cjs')({ browser, webBase, jwt, f, db });
    console.log('Browser: current permissions and revoked access');
    await context.addCookies([{ name: 'e3d_token', value: jwt, url: webBase }]);
    await db.organizationUser.updateMany({ where: { userId: f.actor.sub }, data: { role: 'ANALYST' } });
    await page.goto(webBase + '/');
    assert.equal(await page.getByRole('link', { name: 'Nova campanha', exact: true }).count(), 0);
    await page.goto(webBase + '/campaigns/new');
    await message('Seu perfil permite apenas consultas. Você não pode criar campanhas.');
    assert.equal(await page.getByRole('button', { name: 'Criar campanha', exact: true }).count(), 0);
    await page.goto(webBase + `/campaigns/${f.campaign.id}`);
    assert.equal(await page.getByRole('button', { name: /^(Revisar|Reavaliar|Duplicar|Pausar|Finalizar|Cancelar|Salvar regras|Salvar configurações|Adicionar prêmio|Remover)$/ }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Gerar link de indicação', exact: true }).isEnabled(), true);
    await page.getByRole('button', { name: 'Histórico', exact: true }).click();
    await message('Histórico carregado.');
    const denied = await context.request.post(webBase + `/api/campaigns/${f.campaign.id}/actions/pause`, { data: {} });
    assert.equal(denied.status(), 403);
    await db.organizationUser.updateMany({ where: { userId: f.actor.sub }, data: { role: 'MANAGER' } });
    await page.reload();
    await page.getByRole('button', { name: 'Pausar', exact: true }).waitFor();
    // Permission changes after rendering must still be enforced by the API.
    await db.organizationUser.updateMany({ where: { userId: f.actor.sub }, data: { role: 'ANALYST' } });
    await page.getByRole('button', { name: 'Pausar', exact: true }).click();
    await page.getByRole('button', { name: 'Pausar', exact: true }).waitFor({ state: 'detached' });
    assert.equal((await db.campaign.findUniqueOrThrow({ where: { id: f.campaign.id } })).status, 'ACTIVE');
    await db.user.update({ where: { id: f.actor.sub }, data: { status: 'DISABLED' } });
    await page.getByRole('button', { name: 'Histórico', exact: true }).click();
    await page.waitForURL('**/login?access=expired');
    await message('Sua sessão expirou ou seu acesso não está mais disponível. Entre novamente ou contate o administrador.');
    console.log('Browser checks passed: login, create, reassessment, ranking, history, logout, clipboard deferred success and denial.');
  } finally { await browser.close(); }
};
