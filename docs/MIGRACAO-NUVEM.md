# Migração Giro63

Atualizado em 4 de novembro de 2026. A implantação pública ainda não foi validada.

## Destinos

- GitHub privado: LucasFJU/giro63.
- Vercel: giro63, equipe lucas-evangelistas-projects-da289f0d.
- Supabase: conexão Giro63, projeto tmmsfyubaqnptmstshym, us-east-2.

## Concluído

- Backup anterior: backups/2026-11-04T16-08-52-675Z.
- Schema privado giro63 criado, sem acesso para anon ou authenticated, com índices, busca normalizada e transações.
- Importados 1 acesso da redação, 7 categorias, 16 matérias, 2 campanhas, configurações e agregados anteriores. Sessões e tokens antigos não foram importados.
- Bucket giro63-media criado para imagens públicas, com escrita pelo servidor, formatos JPEG/PNG/WebP e limite de 8 MB.
- SESSION_SECRET gerado e salvo como Secret na Vercel, em Production e Preview. SUPABASE_URL e SUPABASE_STORAGE_BUCKET configurados nos mesmos ambientes.
- Código adaptado para PostgreSQL assíncrono, sessões compartilhadas e Storage. SQLite permanece disponível localmente sem DATABASE_URL.
- Entrada Express app.js para Node 24 e versões responsivas estáticas preparadas. Testes existentes e teste PostgreSQL/PGlite passaram.

## Pendente para ativar

1. Configurar DATABASE_URL (Transaction Pooler do projeto, com TLS) e SUPABASE_SECRET_KEY na Vercel, em Production e Preview. Não enviar valores no chat nem colocá-los no Git. A consulta ao painel foi bloqueada pela permissão de navegação a supabase.com.
2. Disponibilizar as variáveis em arquivo local ignorado e executar node --env-file=.env.cloud scripts/migrate-media.js. O script transfere os uploads antigos e atualiza seus endereços no PostgreSQL, preservando os originais locais.
3. Criar prévia na Vercel e validar login existente, redação, uploads, anúncios, métricas e persistência no projeto real. PGlite não substitui essa validação.
4. Conferir templates, assets e cookies no ambiente Linux da Vercel. Publicar pelo código-fonte, sem reutilizar o pacote prebuilt produzido no Windows.
5. Após verificar, publicar em Production e definir a URL pública em /admin/portal. Indexação permanece desativada; documentos legais ainda exigem revisão e dados reais.

## Operação

DATABASE_URL ativa PostgreSQL. Na Vercel, sua ausência impede iniciar com SQLite por engano. SESSION_SECRET precisa de pelo menos 48 caracteres. SUPABASE_SECRET_KEY é usada somente no servidor.

Uploads enviados pela função ficam limitados a 4 MB na nuvem para respeitar o limite de corpo da Vercel. No modo local, permanecem em 8 MB. A interface mostra o limite do ambiente.

Sessões, tokens de audiência, janelas temporárias de leitura e bloqueio de login ficam no banco. O bloqueio usa HMAC do endereço da conexão, sem IP em texto; a janela de leitura usa hash do identificador aleatório da sessão e expira em 30 minutos.

npm run backup continua protegendo o modo local. O backup da nuvem deve incluir um dump do schema giro63 e os objetos do bucket giro63-media. O SQLite local não é cópia atualizada do portal publicado. Definir retenção e rotina de backup remoto antes da operação editorial real.

exports/import-postgres.sql contém dados sensíveis da migração e permanece ignorado no Git. Não importar novamente sobre um destino preenchido. Credenciais, .vercel, bancos, backups e uploads locais ficam fora do repositório.

A auditoria npm de 04/11/2026 apontou quatro alertas moderados na cadeia de ferramenta jake/filelist/minimatch do EJS. Não foi aplicada atualização forçada de versão principal.
