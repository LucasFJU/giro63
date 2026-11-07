# Giro63

Portal de notícias do Tocantins: site público, painel da redação, publicidade com métricas, tags e uma automação editorial que prepara textos a partir de feeds RSS aprovados, sempre com limites e revisão humana para temas sensíveis.

**Site:** https://giro63.vercel.app

## Stack

| Camada | Tecnologia |
| --- | --- |
| Servidor | Node.js 24, Express 5, EJS (renderização no servidor) |
| Banco | PostgreSQL (Supabase) em produção; SQLite no modo local |
| Mídia | Supabase Storage (bucket `giro63-media`) em produção; pasta `public/uploads` no modo local |
| Hospedagem | Vercel (função Express em `app.js`) |
| IA | Gemini (somente no servidor) para reescrever resumos de feeds aprovados |
| Agendamento | GitHub Actions (`.github/workflows/editorial-automation.yml`), a cada 2 horas |

## Rodar localmente

```bash
npm install
npm run setup   # cria o primeiro editor (senha com 12+ caracteres, sem senha padrão)
npm start       # http://localhost:3000  ·  redação em /admin
```

Sem `DATABASE_URL`, o servidor usa SQLite em `data/`. Para desenvolvimento com recarga automática: `npm run dev`. Dados de demonstração só entram com `npm run seed:demo`.

## Testes

```bash
npm test
```

Requer Node.js 24 (a suíte usa `--test-isolation=none`). Cobre autenticação, CSRF, permissões, fluxo editorial, sanitização, uploads, anúncios, tags, RSS/SSRF, validação da IA e identidade do workflow.

## Variáveis de ambiente

Modelo em `.env.example`. **Nunca** versione valores reais.

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | Ativa PostgreSQL. Na Vercel é obrigatória (evita subir com SQLite por engano). |
| `SESSION_SECRET` | Mínimo de 48 caracteres em produção. |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_STORAGE_BUCKET` | Storage de imagens. A chave secreta é só do servidor. |
| `PUBLIC_URL` | Origem pública (canonical, Open Graph, sitemap). Também configurável em `/admin/portal`. |
| `ALLOW_INDEXING` | `false` por padrão; Campo reservado; habilite a indexação em `/admin/portal` após a revisão de lançamento. |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Automação editorial. Fixe o modelo explicitamente; não há fallback. |
| `AUTOMATION_SECRET` | Opcional. Alternativa ao token OIDC do GitHub (mínimo 32 caracteres). |
| `GIRO63_DATA_DIR`, `PORT` | Apenas modo local. |

## Implantação (Vercel + Supabase)

1. Crie o projeto na Vercel a partir do repositório e cadastre as variáveis acima em Production e Preview.
2. O build roda `scripts/deploy-media.js` (artes legadas) e `scripts/check-editorial.js`. O primeiro está atrelado à URL do projeto Supabase atual; revise-o ao trocar de projeto.
3. As migrações SQL ficam em `supabase/migrations/` e criam o schema privado `giro63` (sem acesso para `anon`/`authenticated`).
4. Uploads na nuvem são limitados a 4 MB (limite de corpo da Vercel); no modo local, 8 MB.
5. Cookies de sessão exigem HTTPS. Sessões, tokens de audiência e bloqueio de login ficam no banco, o que permite várias instâncias.

## Automação editorial

Fluxo: feed RSS aprovado → fila → Gemini → validação → rascunho ou publicação.

- Fontes começam **pausadas**; cada uma exige feed, domínio permitido e nota com as condições de reuso verificadas.
- Fila: até 20 itens, no máximo 4 nacionais, com prioridade regional e expiração após 48 horas.
- Limites diários: 10 publicações, no máximo 3 nacionais, 20 chamadas ao Gemini. Fuso America/Sao_Paulo.
- Vão para **revisão humana**: temas sensíveis (crime, saúde, política, acidentes etc.), números, cidades ou citações não confirmados no resumo, possíveis duplicatas, resumos curtos e conteúdo de agências parceiras.
- Todo texto gerado traz aviso de auxílio de IA e link para a publicação original no fim.
- Recomendação: mantenha a publicação automática **desligada** até revisar uma amostra de lotes na fila.
- O endpoint `POST /internal/automation/run` aceita apenas o token OIDC do workflow oficial (repositório, branch, arquivo, evento, uso único) ou `AUTOMATION_SECRET`.

Detalhes em [docs/AUTOMACAO-EDITORIAL.md](docs/AUTOMACAO-EDITORIAL.md) e [docs/IMAGENS-EDITORIAIS.md](docs/IMAGENS-EDITORIAIS.md).

## Segurança

CSP restrita a `'self'`, Helmet, CSRF em todos os formulários POST, sessão `HttpOnly` + `SameSite=Strict` (+ `Secure` na nuvem), senhas com scrypt, limite de tentativas de login, HTML sanitizado, uploads reprocessados (metadados removidos) e proteção contra SSRF nas buscas de feed e imagem. Reporte problemas de segurança ao responsável pelo projeto, sem abrir issue pública.

## Backup

- **Local:** `npm run backup` (SQLite + uploads, em `backups/`).
- **Nuvem:** o comando acima **não** cobre o banco remoto. Configure backup do schema `giro63` e do bucket `giro63-media` no Supabase e defina a retenção antes da operação editorial real.

## Documentação

- [Guia da redação e operação local](docs/GUIA-REDACAO.md): rotina editorial, categorias, anúncios, busca, privacidade e audiência.
- [Migração para a nuvem](docs/MIGRACAO-NUVEM.md)
- [Automação editorial](docs/AUTOMACAO-EDITORIAL.md)
- [Imagens editoriais](docs/IMAGENS-EDITORIAIS.md)
- [Fontes e créditos de imagem](ASSETS.md)
