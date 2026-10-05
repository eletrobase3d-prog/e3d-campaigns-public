# Relatório de sanitização da edição pública

Data: 05/10/2026. Base: pacote Sprint 3I. Esta exportação contém código e documentação pública; não é uma nova sprint funcional nem uma confirmação de deploy/aceite da 3I.

## Seleção e exclusões

Incluídos: fontes API/web, manifests/lockfiles, migrations de schema, testes com dados sintéticos, Dockerfiles, Compose local adaptado e documentação pública. Código produtivo e dependências preservados em relação à base. Diretórios reorganizados para apps/api e apps/web; caminho entre testes corrigido. Um marcador estático de hash inválido de teste foi substituído por bytes aleatórios gerados em execução. Senhas usadas para login nos testes e a chave JWT de testes são geradas em execução, não publicadas.

Excluídos: .git/histórico, ambientes reais, Documentação Mestra DOCX, anotações internas de sprints, caminhos de máquina, anexos, capturas reais, node_modules, builds, logs, dumps, backups e dados de produção. Os SVG incluídos são placeholders editoriais. LICENSE anterior preservado; NOTICE atualizado para refletir a inclusão do código.

.env.example contém campos de senha/JWT vazios. Compose exige preenchimento local e não incorpora valores de produção. URLs mantidas são referências públicas de dependências/documentação, serviço genérico Docker, loopback local, example.invalid ou compartilhamento WhatsApp sem destinatário fixo. Não há URL operacional de produção nesta edição.

## Verificações

- Varredura heurística por chaves privadas, formatos de tokens, JWT literais, URLs de banco com senha, IPs privados, caminhos pessoais, contatos e credenciais literais: sem achados pendentes.
- Conferência de igualdade dos arquivos de aplicação e dependências com a fonte, exceto adaptações documentadas de exportação.
- Verificação de sintaxe dos testes CJS, links internos da documentação e integridade do ZIP.
- Três testes unitários de datas passaram nesta exportação, usando dependências locais já disponíveis. Builds e 61 testes de integração referidos no README são evidências da fonte 3I; não foram repetidos na árvore pública. Docker Compose adaptado não foi executado nesta exportação.

## Limites

A análise usa seleção explícita de arquivos, revisão e padrões heurísticos; não garante detectar qualquer segredo concebível e não equivale a auditoria de segurança da aplicação. Histórico e conteúdo do repositório GitHub existente não foram acessados. O ZIP não contém histórico Git. O .gitignore e o verificador ajudam em atualizações futuras, mas não removem arquivos já rastreados nem segredos de commits anteriores.

Antes de publicar, revisar os arquivos que já existem no repositório público e o diff final. Credenciais eventualmente expostas no passado devem ser revogadas/rotacionadas e tratadas também no histórico. Esta entrega não foi enviada automaticamente ao GitHub.
