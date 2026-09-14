# Publicação e atualizações futuras

## Subir este pacote no GitHub

1. Extraia o ZIP e abra a pasta `e3d-campaigns-public`.
2. No repositório público, use **Add file → Upload files** e envie o conteúdo da pasta, não o ZIP. Confirme que README, LICENSE e docs ficaram na raiz.
3. Inclua também `.gitignore` e `.env.example`, que podem estar ocultos no explorador. Se necessário, use **Create new file** para cada arquivo oculto e copie seu conteúdo.
4. Revise a lista de arquivos e confirme o commit. Não selecione uma licença MIT ou outra licença ampla automaticamente.
5. Descrição sugerida: “Portfólio do E3D Campaigns: campanhas de indicação, gestão e ranking. Documentação técnica; código em preparação para publicação.”
6. Tópicos sugeridos: `portfolio`, `typescript`, `nestjs`, `nextjs`, `referral`, `saas`.

Esta publicação inicial é documental. Não conecta o repositório a um ambiente de produção.

## A cada nova sprint

1. Parta de uma cópia limpa do repositório público. Exporte apenas os arquivos necessários da versão privada para uma pasta de revisão separada, sem histórico Git.
2. Compare a nova versão com a versão pública anterior. Revise também arquivos removidos e renomeados: copiar apenas por cima pode deixar código obsoleto.
3. Sanitizar fontes, configurações, fixtures, seeds, testes, lockfiles e documentação. Procure tokens, senhas, chaves, IPs, URLs privadas, contatos, dados pessoais e dumps. Uma busca textual não substitui revisão humana ou scanner de segredos.
4. Use um scanner de segredos atualizado na cópia candidata e no histórico público. Resolva os achados antes do commit. Não copie um histórico privado para preservar a evolução.
5. Execute os testes e o build aplicáveis à versão importada. Registre os resultados em `CHANGELOG.md`, sem logs privados.
6. Atualize README, roadmap, arquitetura e screenshots apenas para comportamentos comprovados. Mantenha claramente o que está planejado.
7. Revise o diff completo e os arquivos preparados para commit. Faça um commit público descritivo, por exemplo `docs: registrar evolução da Sprint 3A`.

## Publicar com Git local

Use um clone do repositório público e copie a pasta revisada para ele. Não adicione o remoto público ao checkout de produção e não faça mirror push. Antes de enviar:

```sh
git status --short
git diff
git add README.md LICENSE NOTICE SECURITY.md CONTRIBUTING.md ROADMAP.md CHANGELOG.md .gitignore .env.example apps docs
git diff --cached --stat
git diff --cached
git commit -m "docs: publicar estrutura de portfolio"
git push
```

Os comandos pressupõem um clone público com remoto já configurado. `git add` inclui alterações e exclusões dentro dos caminhos listados; revise tudo antes do commit. Prefira um endereço de commit no-reply configurado no GitHub para não expor um email pessoal.

## Credencial exposta

Revogue ou rotacione a credencial e remova o material sensível da publicação. Se entrou no histórico público, trate também esse histórico; exclusão posterior não apaga forks, clones ou caches. Mantenha o relato detalhado em canal privado.
