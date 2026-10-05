# E3D Campaigns

Plataforma SaaS de campanhas de indicação, com painel administrativo, páginas públicas, regras de participação, revisão de indicações e ranking.

**Portfólio público com código-fonte · Base Sprint 3I · Atualizado em 05/10/2026**

Esta edição sanitizada reúne o código atual para avaliação técnica por recrutadores. Não inclui ambientes privados, dados reais de participantes ou histórico do repositório original. O código está visível sob reserva de direitos: consulte [LICENSE](LICENSE) e [NOTICE](NOTICE).

## O que avaliar no projeto

- **Backend:** NestJS e Prisma, isolamento por organização e permissões consultadas no banco a cada requisição administrativa.
- **Consistência:** transações PostgreSQL com auditoria conjunta, bloqueios e tentativas limitadas em conflitos concorrentes.
- **Domínio:** indicação pendente/válida/inválida, prazo mínimo, revisão manual, reavaliação e score calculado apenas com indicações válidas.
- **Frontend:** Next.js e React, mensagens de ação, tratamento de falhas de cópia, painel administrativo e cadastro público.
- **Tracking:** links canônicos, compatibilidade com links legados inequívocos e eventos de clique idempotentes. Cliques não representam pessoas únicas.
- **Agendamento:** ativação de campanhas explicitamente agendadas, com horários apresentados em UTC−3 e instantes persistidos em UTC.

## Stack e estrutura

TypeScript · NestJS 11 · Next.js 15 · React 19 · PostgreSQL 16 · Prisma 6 · Redis · Docker.
As versões resolvidas estão nos lockfiles. Redis faz parte da infraestrutura; o agendamento atual usa processamento periódico na API e PostgreSQL, sem fila Redis.

```text
apps/api/       API, schema, migrations e testes de integração
apps/web/       painel, páginas públicas e testes de datas
docs/           arquitetura, limites, verificação e atualização pública
scripts/        verificação preventiva do conteúdo público
```

[Arquitetura](docs/architecture.md) · [Estado e evidências](docs/project-status.md) · [Roadmap original](ROADMAP.md)

## Funcionalidades

Cadastro/login; organizações; perfis OWNER, ADMIN, MANAGER e ANALYST; campanhas, regras e prêmios; participantes e indicação; ranking; revisão e reavaliação com histórico; cliques registrados; botão que copia/abre a página da campanha; agendamento do início.

A gestão de membros pelo painel, recuperação de senha, finalização automática e congelamento do ranking continuam pendentes. Não se trata de uma declaração de prontidão comercial ou auditoria completa de segurança.

## Executar localmente

Requer Docker Compose. Copie `.env.example` para `.env` e preencha POSTGRES_PASSWORD e JWT_SECRET com valores novos, exclusivos deste ambiente local. Use valores hexadecimais aleatórios para evitar caracteres reservados na URL do banco. Gere cada valor separadamente com:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Nunca reutilize credenciais de produção. Então execute:

```sh
docker compose up --build
```

Abra `http://localhost:3000`. O Compose limita a porta web ao loopback. PostgreSQL/API não são expostos ao host. As migrations são aplicadas pelo container da API. Não há conta ou senha padrão. A interface atual contém login, mas não criação de conta; em um cliente HTTP local, use POST /api/v1/auth/register na API para criar uma organização e seu proprietário. Esse endpoint não cria um ANALYST na organização existente. Consulte o DTO em apps/api/src/auth/dto/register.dto.ts; use exclusivamente dados fictícios em demonstrações.

O Compose público foi adaptado à estrutura apps; não foi executado nesta exportação. [Builds e testes](docs/testing.md).

## Interface

As imagens abaixo são **placeholders**, não capturas de um ambiente real.

![Placeholder do painel](docs/screenshots/dashboard.svg)
![Placeholder da página pública](docs/screenshots/public-campaign.svg)

[Como preparar screenshots sintéticos](docs/screenshots/README.md).

## Atualizações públicas

Leia [Publicação e atualizações](docs/publication-guide.md) e [Relatório de sanitização](docs/sanitization-report.md) antes de enviar novos arquivos. O projeto privado continua sendo a fonte de desenvolvimento; cada versão pública deve passar por revisão própria.

## English summary

E3D Campaigns is a work-in-progress referral campaign SaaS built with NestJS, Next.js, TypeScript, PostgreSQL and Prisma. This sanitized portfolio snapshot contains source code, migrations and synthetic-data tests through Sprint 3I. Highlights include tenant isolation, current-role authorization, transactional audit records, referral reassessment, idempotent click tracking and explicit campaign scheduling. Private configuration, production data and Git history are excluded. Original-source tests are documented separately from checks performed on this export. Public visibility does not grant a broad software license; see LICENSE.
