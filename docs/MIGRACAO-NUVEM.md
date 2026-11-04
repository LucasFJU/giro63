# Migração Giro63 — em preparação

Destino GitHub confirmado: LucasFJU/giro63 (privado).
Destino Vercel confirmado: lucas-evangelistas-projects-da289f0d.
Destino Supabase confirmado: conexão Giro63; seu identificador ainda não aparece nas ferramentas desta sessão. Não substituir por Primary ou Site MF.

O aplicativo em npm start ainda usa SQLite e uploads locais. Não publicar esse comando na Vercel antes de portar o acesso ao banco, sessões, uploads, contadores e bloqueio de login para armazenamento compartilhado.

Clientes pg e @supabase/supabase-js instalados com versões fixadas. O arquivo .env.example contém somente nomes e valores não secretos. Credenciais, banco, backups e imagens enviadas permanecem fora do Git e dos arquivos de implantação.

A tentativa de criar um projeto separado na conexão Primary foi recusada por limite de dois projetos gratuitos ativos de LucasFJU. Nenhum projeto existente foi pausado ou alterado.

A conexão Vercel atual só lista Mundo dos Ferros. O destino solicitado retornou 403; a geração de link de autorização retornou 404, tanto por ID retornado quanto pelo slug fornecido. É necessário disponibilizar o acesso à equipe correta antes de criar o projeto Giro63.

O plugin GitHub identifica LucasFJU, mas não oferece criação de repositório nesta sessão. O formulário de criação no navegador exige login. Não foi criado repositório remoto nem publicada aplicação.

Backup anterior à preparação: backups/2026-11-02T18-30-50-336Z.

Próximas etapas: habilitar as conexões de destino; criar recursos separados; converter as operações síncronas SQLite em acesso assíncrono PostgreSQL; mover mídias para Storage; persistir sessões e identificadores temporários; testar migração e permissões; enviar código ao repositório privado; criar implantação de prévia sem indexação; conferir os fluxos completos antes de liberar domínio.
