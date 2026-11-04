# Giro63

Portal de notícias do Tocantins com site público, redação, publicidade e dados locais. Node.js 24, Express, EJS e SQLite. Acesso restrito a `127.0.0.1`.

## Iniciar

Abra o PowerShell nesta pasta:

```powershell
Set-Location 'D:\Documents\Lorena Macedo\giro63'
npm install
npm run setup
npm start
```

`setup` pede nome, e-mail e senha do primeiro editor. A senha não é exibida e deve ter pelo menos 12 caracteres. Não há senha padrão. Depois do primeiro editor, novos acessos são criados no painel **Equipe**. Não apague o banco para recuperar acesso; preserve o backup e solicite recuperação local assistida.

- Portal: http://localhost:3000
- Redação: http://localhost:3000/admin
- Encerrar: `Ctrl+C` no terminal do servidor.
- Atalhos no Windows: **Criar primeiro editor.cmd** para configurar o acesso e **Iniciar Giro63.cmd** para iniciar o servidor com dois cliques.
- Desenvolvimento com reinicialização automática: `npm run dev`.
- Para outra porta: `$env:PORT='3001'; npm start` (em comandos separados, se preferir).

As fontes e fotografias já estão em `public/`; o site não precisa de internet para funcionar. `npm run assets` prepara novamente as fontes a partir dos pacotes instalados e baixa imagens ilustrativas ausentes. A instalação inicial de dependências requer internet. Não execute novamente para substituir fotografias escolhidas pela redação.

## Rotina editorial

1. O editor cadastra autores e editores em **Equipe**. Cada pessoa recebe seu próprio acesso.
2. O autor cria uma matéria com título, resumo, corpo, editoria e cidade. Pode salvar rascunho, visualizar uma prévia ou enviar para revisão.
3. O editor revisa, devolve com orientação ou publica. Para uma matéria real, fontes e crédito de imagem são obrigatórios. Revise os direitos das imagens antes de publicar.
4. O editor escolhe a manchete (posição 1) e os destaques laterais (2–4). A publicação em uma posição substitui o destaque anterior. Sem destaques, a página usa as matérias mais recentes.
5. O editor pode retirar uma matéria do site salvando-a como rascunho. Autores não podem modificar matérias publicadas nem as de outras pessoas.

As datas são exibidas no fuso de São Paulo. As URLs das matérias permanecem estáveis quando o título é alterado. A data da primeira publicação é preservada e a atualização fica registrada. O editor de texto limpa formatação colada; o servidor sanitiza o HTML.

O banco inicial contém 16 exemplos marcados como demonstração. Eles não representam notícias apuradas. Ao preparar uma notícia real, substitua todo o conteúdo, confira as fontes e desmarque **Conteúdo demonstrativo**. Exemplos podem ser retirados do site salvando-os como rascunho. Sem publicações, a página apresenta um estado vazio.

A identidade visual usa Merriweather nos títulos, Inter nos textos, logotipo em maiúsculas, azul noite, terracota e areia. **Apenas a matéria definida como “1 · Manchete principal” tem o título sobre a fotografia na página inicial.** Chamadas laterais, listagens e páginas de leitura mantêm o título fora da imagem. Se nenhuma matéria ocupar a posição 1, a abertura usa o título separado da foto.

## Instagram, contatos e anúncios

Em **Configurações**, preencha o endereço completo do Instagram, e-mail público, telefone, expediente e política editorial. Enquanto não forem preenchidos, o portal indica os dados pendentes; nenhum contato é inventado.

A divulgação no Instagram é manual: copie o link da matéria, prepare a publicação e utilize seu perfil. Não há integração de postagem automática. Links compartilhados apontam para localhost nesta versão; serão acessíveis apenas no computador do portal. Pré-visualizações no WhatsApp e no Instagram só poderão ser confirmadas após hospedagem pública. Os metadados já estão preparados para as matérias.

As páginas de matérias usam uma coluna de leitura de até 760 px com título, capa e texto alinhados. No desktop, há uma lateral de 200 px com bloco de apoio e anúncios, separada por 48 px. Abaixo de 1000 px, essa lateral passa para depois da autoria e antes das notícias relacionadas. Os anúncios não se repetem abaixo do texto.

O cabeçalho mantém a faixa laranja e a logo branca no topo. A navegação azul recolhe ao rolar para baixo e reaparece ao rolar para cima; menus abertos e navegação por teclado mantêm os controles acessíveis. No desktop, o bloco lateral acompanha a leitura abaixo do cabeçalho e para no limite da matéria. Em telas menores, ele permanece no fluxo após a autoria.

Em **Publicidade**, cadastre imagem, descrição acessível, link e posição. É possível editar o anúncio e ativar ou desativar sua exibição. Todos os anúncios ativos de uma posição são exibidos, sem rodízio automático. Formatos sugeridos: 1440 × 240 para faixas, 600 × 600 para lateral. A imagem é exibida inteira. Sem anúncio, as faixas mostram uma chamada comercial e a lateral fica vazia.

Uploads: JPG, PNG ou WebP estático de até 8 MB e 25 megapixels. As imagens são verificadas, reprocessadas para WebP e armazenadas em `public/uploads`. Metadados embutidos são removidos. O servidor utiliza nomes aleatórios e não executa os arquivos. Imagens substituídas permanecem no disco para não quebrar cópias e backups; limpeza de mídia é uma evolução futura.

## Backup e restauração

Execute:

```powershell
npm run backup
```

Cada execução cria uma pasta datada em `backups/`, com uma cópia consistente do SQLite e os uploads. Copie essa pasta para um local seguro de sua escolha. O backup contém os hashes de senha da equipe e os contatos públicos; restrinja seu acesso.

Para restaurar:

1. Pare o servidor com `Ctrl+C` e preserve uma cópia da pasta `data` e de `public/uploads` atuais.
2. Copie `giro63.sqlite` do backup para `data/giro63.sqlite`. Antes, mova os arquivos antigos `giro63.sqlite`, `giro63.sqlite-wal` e `giro63.sqlite-shm` para a cópia de segurança; não misture arquivos de execuções diferentes.
3. Restaure a pasta `uploads` do backup em `public/uploads`.
4. Remova `data/.session-secret` para invalidar sessões antigas; uma nova chave será gerada na próxima inicialização. Não compartilhe essa chave.
5. Execute `npm start` e entre novamente. Verifique matérias e imagens.

O código, fontes e imagens demonstrativas fazem parte do projeto, não do backup editorial. Preserve também a pasta do projeto para uma restauração em outro computador.

## Validação e limites

`npm test` executa testes de integração com banco temporário, sem modificar seus dados. Abrange autenticação, CSRF, permissões, fluxo editorial, sanitização, uploads, anúncios, equipe, busca, páginas e persistência.

As senhas usam scrypt com salt individual. Sessões persistem no SQLite, expiram após oito horas e usam cookies HttpOnly e SameSite Strict. Dez tentativas incorretas de login por IP bloqueiam novas tentativas por 15 minutos (contador local ao processo). Desativar uma pessoa revoga seu acesso inclusive em sessões abertas. O primeiro editor não pode desativar a própria conta.

Este é um ambiente local: não exponha a porta do servidor na rede. A futura publicação deverá incluir domínio, HTTPS, configuração de URL pública e cookies seguros, política de privacidade definitiva conforme os serviços adotados, revisão editorial dos textos institucionais, estratégia de backup externo e teste de compartilhamento público. Não estão incluídos comentários, analytics, redes de anúncios, automações sociais ou serviços de previsão do tempo.

O Node.js 24 pode emitir aviso de API experimental do SQLite; isso não impede o funcionamento. Consulte `ASSETS.md` para fontes e créditos das imagens.

## Painel da redação atualizado

- /admin: visão geral com indicadores e rotina editorial.
- /admin/materias: lista com busca por título, autor e cidade, filtros por situação e categoria.
- /admin/categorias: editores podem criar categorias, renomear, ordenar e escolher a presença no menu público. Os endereços existentes são preservados ao renomear. Categorias novas ficam fora do menu até a opção ser marcada.
- Na edição, os atalhos levam ao texto, organização editorial, capa e publicação. O painel mostra contagem de caracteres e palavras, prévia da imagem e aviso de alterações não salvas. Salvar rascunho mantém a matéria aberta.
- As categorias ficam no SQLite e são incluídas no backup normal. O cadastro inicial é migrado automaticamente sem substituir nomes já editados.

## Campanhas publicitárias

Acesse /admin/publicidade como editor. Cadastre a campanha em Nova campanha, confira a prévia e ative-a na edição ou na lista. Campanhas novas são salvas pausadas. É possível pesquisar por campanha/anunciante, filtrar situação e espaço, pausar, retomar, arquivar e restaurar. A restauração mantém a campanha pausada.

Os horários de início e término são interpretados em America/Sao_Paulo; o início é inclusivo e o término é exclusivo. Campos vazios não limitam o período. Uma campanha encerrada só volta a ser elegível após ajustar o término. Cada espaço exibe um anúncio por carregamento, em rodízio sequencial persistido por posição no SQLite. A seleção ocorre apenas ao renderizar espaços em páginas públicas GET; prévias administrativas, arquivos e pedidos HEAD não participam.

Resultados mostra exibições, cliques e taxa de cliques no período, com evolução diária e tabela. A exibição exige 50% da imagem carregada visível durante um segundo contínuo, em aba visível. O identificador de cada anúncio servido expira em uma hora e aceita no máximo uma exibição e um clique; cliques repetidos ainda redirecionam, sem incrementar. Sem JavaScript ou com bloqueadores, exibições podem não ser medidas; cliques podem ser registrados sem uma exibição medida. A taxa usa cliques / exibições medidas, e não representa visitantes únicos. Os registros não armazenam IP, identidade ou histórico de navegação.

Os dados de campanhas, rodízio e resultados ficam no SQLite e integram o backup normal. Identificadores temporários expirados são limpos durante a seleção de anúncios. Os anúncios anteriores preservam ativação/posição e começam sem programação e sem métricas históricas. Este ambiente mede somente os acessos efetivos ao portal local. Não há exportação CSV nesta versão.

## Leitura, busca e mais lidas

A busca pública aceita assunto, editoria e cidade, ignora acentuação/caixa e mantém filtros e paginação na URL. A lista de cidades combina as opções iniciais com as cidades das matérias publicadas. O menu agrupa editorias excedentes em Mais e continua acessível pelo teclado.

Mais lidas considera os últimos sete dias de calendário, incluindo hoje, em America/Sao_Paulo. Cada matéria recebe no máximo uma visita por sessão a cada 30 minutos; pedidos HEAD, prévias administrativas e membros autenticados da equipe ficam excluídos. O SQLite guarda somente totais diários por matéria; o controle temporário do intervalo fica na sessão existente, sem IP no ranking. Recusar/apagar cookies ou iniciar outra sessão permite uma nova contagem; não representa pessoas únicas. Matérias retiradas deixam o ranking imediatamente, preservando seus totais. Backups habituais já incluem os dados.

Novas capas ganham versões WebP de 160, 320, 640, 960 e 1600 px, sem ampliar imagens pequenas nem substituir originais. Execute npm run media:editorial para gerar versões das capas antigas ou reconstruí-las depois de restaurar um backup. As versões ficam em public/uploads/editorial-variants e integram o backup de imagens; esse processamento não altera artes publicitárias.

## Busca, compartilhamento, audiência e privacidade

Em /admin/portal, editores configuram a URL pública (origem, sem caminho), habilitam indexação e editam os documentos legais. A indexação começa desativada. Sem URL pública, sitemap.xml responde 503; com URL e indexação desativada, fica vazio. Ao habilitar, são incluídas matérias publicadas não demonstrativas, suas cidades/editorias e páginas institucionais. Busca, painel, erros, prévias e documentos legais não revisados recebem noindex. Isso orienta buscadores; acesso ao painel continua protegido por login. A URL configurada alimenta canonical e Open Graph; sem ela usa localhost e PORT. A prévia externa no WhatsApp só poderá ser conferida após hospedagem pública.

Execute npm run assets:portal para reconstruir a imagem padrão de 1200 × 630, favicons e manifesto a partir da marca local. Não há dependência de CDN ou gerador remoto. Capas podem receber descrição acessível própria no editor.

A nova audiência está em /admin/audiencia, restrita a editores. Mostra visualizações, evolução diária e até 100 páginas por período (máximo 366 dias), sem visitantes únicos, IP, localização, referenciadores, termos de busca ou query strings. O visitante precisa aceitar estatísticas. A preferência HttpOnly de primeira parte dura seis meses e pode ser modificada no rodapé. Recusar não bloqueia o portal. A medição usa token aleatório por carregamento, de uso único, válido por cinco minutos e mantido apenas em memória; reiniciar o servidor invalida tokens pendentes. Pedidos HEAD, equipe autenticada, prévias e busca não emitem tokens de medição. Agregados diários por caminho ficam no SQLite por 12 meses, com limpeza na inicialização e no primeiro acesso de cada dia. Não se tenta reidentificar visitantes.

Os contadores de Mais lidas, as métricas publicitárias e as sessões existentes permanecem independentes do consentimento para a nova audiência. As páginas legais descrevem essa distinção e apontam a revisão pendente de retenção desses históricos, backups e futura hospedagem. Os backups habituais já incluem audiência, configurações e textos legais. Os textos são bases editáveis, sem declaração automática de conformidade; devem ser completados e revisados antes do lançamento. Nome do responsável, e-mail de privacidade e textos de pelo menos 100 caracteres são exigidos para marcar documentos como revisados. Alterar texto ou contato na interface desmarca a revisão para nova conferência.

Formulários POST recebem indicação de envio e bloqueio de repetição. Com JavaScript ativo, erros do servidor/conexão preservam o formulário aberto e indicam campos quando identificados. Em falha incerta de conexão, confira a lista antes de repetir um cadastro. Sem JavaScript permanece o envio tradicional; uploads não podem ser reconstituídos pelo navegador, exigindo nova seleção após um erro.
