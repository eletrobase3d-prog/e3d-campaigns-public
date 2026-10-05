# Publicar e atualizar o portfólio

1. Extrair o ZIP público em uma pasta separada. Usar somente o conteúdo dessa exportação para o repositório e3d-campaigns-public.
2. Substituir a antiga estrutura de placeholders pelo conteúdo completo, preservando os nomes apps/api e apps/web. Não enviar o ZIP de implantação privado nem a Documentação Mestra interna.
3. Executar python scripts/check-public.py. Revisar também o diff antes do commit. No upload web do GitHub, respeitar menos de 100 arquivos por lote.
4. Conferir os arquivos já existentes no repositório: uma atualização por upload não apaga automaticamente arquivos antigos. Remover do estado atual documentos privados ou dados reais que não pertençam à edição pública.
5. Esta exportação não contém .git e não revisa commits remotos. Se algo sensível já foi publicado, revogar/rotacionar a credencial e tratar o histórico; remover apenas o arquivo atual é insuficiente.

## Atualizações futuras

Usar exportação por lista de inclusão: código, migrations de estrutura, manifests/lockfiles, testes sintéticos e documentação pública. Não copiar a árvore privada inteira. Excluir .env reais, histórico, node_modules, builds, logs, dumps, backups, anexos, screenshots reais e documentos internos. Não ignorar todos os SQL: migrations de schema revisadas fazem parte do código; dumps de dados não.

Adaptar os contextos Compose para apps/api e apps/web e a referência entre testes para ../../web. Preencher exemplos somente com campos vazios, placeholders ou valores genéricos locais. Nunca usar variáveis NEXT_PUBLIC para segredos.

Atualizar README, CHANGELOG e estado dos testes sem presumir deploy/aceite. Screenshots devem vir de demonstração sintética. Reexecutar a revisão em cada versão, mesmo quando a anterior passou. O .gitignore não remove arquivos já rastreados.
