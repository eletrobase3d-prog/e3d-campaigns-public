# Builds e testes

Em apps/api: npm ci, npm run prisma:generate e npm run build. Em apps/web: npm ci e npm run build. As versões resolvidas são preservadas nos lockfiles.

A integração exige TEST_DATABASE_URL apontando explicitamente para um banco descartável chamado e3d_sprint3a_test. Não usar banco de produção. Aplicar as migrations nesse banco antes da suíte. Em apps/api, npm run test:integration compila e executa os arquivos *.integration.cjs, que carregam os cenários auxiliares. Os workers são desativados pela suíte e exercitados de forma controlada.

Para a parte web, compilar apps/web e definir TEST_WEB=true, TEST_PLAYWRIGHT_MODULE com a instalação local do Playwright e TEST_BROWSER_CHANNEL com um navegador compatível instalado. A suíte inicia o Next.js localmente. Valores de autenticação usados nos testes são gerados durante a execução; contatos de exemplo são fictícios.

Datas: em apps/web, executar node --test test/date-time.test.cjs.

Sanitização: na raiz, python scripts/check-public.py. Este comando não envia dados a serviços externos e informa somente caminhos/categorias de achados.
