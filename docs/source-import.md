# Incorporar o código original

Os ZIPs citados no histórico não estavam recuperáveis como arquivos. Portanto, esta edição não tenta reconstruir o sistema a partir de fragmentos ou apresentar uma implementação nova como se fosse a original.

## Arquivos necessários

Obter uma cópia local do estado atual e registrar privadamente seu commit de origem. Trazer para uma área de revisão os fontes de API e web, manifests, lockfiles, schema Prisma, migrations estruturais, testes, configuração de build e Dockerfiles pertinentes. Respeitar a estrutura original se ela diferir de `apps/api` e `apps/web`; corrigir os links deste portfólio nesse caso.

Não copiar `.git`, arquivos de ambiente, volumes, dumps, dependências instaladas, logs, uploads ou credenciais. Revisar migrations SQL: manter mudanças de schema, remover dados privados; não ignorar indiscriminadamente todos os arquivos SQL.

## Antes de substituir os placeholders

- Inspecionar strings fixas, seeds, testes, exemplos, manifests, lockfiles, URLs de registry, configurações de CI e Docker.
- Substituir dados de demonstração por dados sintéticos; não apenas trocar nomes mantendo contatos ou identificadores reais.
- Conferir cada variável lida pela aplicação e atualizar `.env.example` com valores vazios ou placeholders explícitos.
- Preservar avisos de autoria e licenças de terceiros.
- Executar instalação, geração Prisma, migrations e build em ambiente descartável, conforme os scripts efetivamente existentes.
- Registrar versões de runtime, comandos exatos e resultados antes de acrescentar um guia de execução ao README.

Após verificar a cópia sanitizada, remover os README de reserva das duas aplicações e atualizar a nota de edição documental. Não publicar uma afirmação de código auditado ou aplicação executável antes dessa verificação.
