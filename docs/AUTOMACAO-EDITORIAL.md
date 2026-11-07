# Automação editorial Giro63

## Situação inicial

As 16 demonstrações foram retiradas de publicação em 06/11/2026. O backup anterior dos dados de produção está no schema privado giro63_backup_20261106; cópia local em backups/2026-11-06T17-54-20-164Z. Contas, anúncios e configurações foram preservados.

A inicial exibe um estado vazio até surgirem notícias reais. A inicialização local também não cria demonstrações. Para dados de desenvolvimento, use npm run seed:demo explicitamente.

## Painel

/admin/tags permite criar, renomear, remover e unificar assuntos. Tags são independentes das editorias. O editor de matérias aceita até cinco tags separadas por vírgula, reaproveitando nomes equivalentes e criando novos assuntos automaticamente. Renomear preserva o slug; unificar transfere as associações. As páginas públicas ficam em /tag/:slug e a busca aceita tag na URL.

/admin/automacao permite consultar fontes, filas, execuções e quotas. A chave Gemini é lida somente no servidor; a presença foi confirmada em Preview e Production. O modelo inicial gemini-3.7-flash respondeu HTTP 200 na verificação de disponibilidade.

As três fontes começam pausadas. O feed candidato da Agência Brasil foi consultado com sucesso. G1 Tocantins e Agência Tocantins exigem confirmação de feed. Todas exigem registro das condições de reutilização aplicáveis, incluindo restrições de conteúdos parceiros. RSS não é considerado autorização de reprodução. Não são extraídos artigos completos ou fotografias.

## Ativação

1. Registrar no painel as condições de uso verificadas e o feed de cada fonte autorizada. Ao ativar uma fonte, o servidor verifica domínio, DNS público, HTTPS e formato RSS/Atom.
2. Habilitar coleta e geração mantendo publicação automática desmarcada. Executar um lote e conferir a origem e os textos gerados na fila editorial.
3. Após conferir uma amostra, habilitar publicação automática dos itens elegíveis. Crimes, acusações, política/eleições e saúde, alertas e resultados incertos permanecem em revisão. Resumos insuficientes e possíveis duplicatas ficam na fila para trabalho manual.

Limites: dez publicações diárias, no máximo três nacionais e vinte chamadas Gemini, incluindo tentativas. Horário America/Sao_Paulo. Dois itens por lote, até duas tentativas por item, entradas de 6.000 caracteres e saída limitada. Esses limites não equivalem a orçamento monetário. O consumo informado pela API fica no relatório.

## Execução e segurança

O workflow .github/workflows/editorial-automation.yml agenda execuções a cada duas horas no minuto 17, em UTC, e permite disparo manual. Requer estar na branch principal. Não guarda chave Gemini ou senha do banco no GitHub.

O endpoint POST /internal/automation/run verifica JWT OIDC assinado pelo GitHub, emitente, audiência, IDs imutáveis do repositório e proprietário, branch, arquivo do workflow, evento e expiração. Cada token é consumido uma única vez. AUTOMATION_SECRET continua como alternativa opcional para integrações autorizadas.

Fila, bloqueios e quotas persistem no Supabase. Falhas não ultrapassam o limite de chamadas, e a execução interrompida é retomada com tentativas limitadas. Fontes atualizadas geram aviso, sem sobrescrever textos da redação. A pausa geral impede novas gerações e publicações.

As tabelas tags, article_tags, automation_sources, automation_items, automation_daily, automation_lock e automation_events pertencem ao schema privado giro63 e devem integrar o backup habitual junto com as tabelas anteriores. Sessões e permissões editoriais existentes continuam em uso.

## Verificação

Foram acrescentados testes de tags, RSS, bloqueio de rede privada, validação dos dados gerados, fila, deduplicação, quotas, pausa, identidade de workflow e acesso por perfil. A suíte completa passou com 40 testes. A prévia abriu a inicial vazia e as telas autenticadas de Tags e Automação. A disponibilidade do modelo foi conferida sem gerar uma notícia ou ativar a publicação. A primeira execução agendada real deve ser conferida na aba Actions do GitHub.

## Ativação e lote inicial — 06/11/2026

Modelo fixado explicitamente na Vercel: `gemini-3.5-flash-lite`, após teste real. O 3.8 excedeu o prazo e os modelos 2.5 responderam indisponíveis para esta conta. Não há fallback automático.

O script operacional `scripts/prepare-initial-news.js`, habilitado apenas por `PREPARE_INITIAL_NEWS=1`, preparou o lote inicial excepcional solicitado pelo proprietário. Ele nunca publica e exige a coleta e a publicação pausadas. A exceção limita-se a 20 matérias preparadas e até 24 tentativas específicas, com cada chamada somada aos contadores diários. Não está no comando de build normal. Os testes de diagnóstico também foram contabilizados.

Os textos foram confrontados individualmente com o material RSS recebido, com correções de redação, temporalidade, números ambíguos e autoria de gol antes da publicação. Isso é uma revisão de consistência com a fonte, sem apuração independente. Não foram importadas fotografias. Somente a Agência Brasil está liberada; conteúdos de parceiros identificados permanecem para revisão de direitos.

Após o lote inicial, mantêm-se os limites normais no código: 10 publicações/dia, até 3 nacionais e 20 chamadas/dia, em São Paulo. O histórico excepcional não é zerado: impede novas gerações no mesmo dia e os limites voltam a valer na virada do dia. Conteúdos sensíveis continuam em revisão. Backups incluem todas as tabelas `automation_*`, `tags` e `article_tags`.

Itens identificados como vídeos ou edições de telejornais são ignorados na coleta. Pendências antigas desses formatos passam para Descartados, preservando matérias vinculadas e publicações existentes.

## Prioridade do dia — 07/11/2026

A data de referência é a publicação original na fonte, no horário de São Paulo. Cada lote seleciona: Tocantins nas últimas duas horas (inclusive o limite exato), nacional de hoje, Tocantins mais antiga de hoje. Nacionais deixam de ser elegíveis quando atingem três publicações no dia. Sem candidato ou com a cota diária esgotada, aguarda novas notícias sem chamar o Gemini.

A fila guarda até 20 itens, reservando até quatro lugares nacionais quando disponíveis. A seleção de cada grupo usa a publicação mais recente. Itens de dias anteriores, sem matéria criada, são descartados com o motivo Fora do dia atual. A proteção de 48 horas também permanece. Revisões e matérias existentes são preservadas. A manutenção acontece após coleta e ao abrir o painel.

As cotas continuam em 10 publicações/dia, até três nacionais publicadas e 20 chamadas/dia. Os quatro lugares nacionais na fila são um limite independente. Cada execução usa um horário de referência único para seleção, limpeza e contadores; os prazos de rede continuam usando o relógio real. Eventos registram a faixa selecionada e o identificador do item ou a ausência de candidatos.
