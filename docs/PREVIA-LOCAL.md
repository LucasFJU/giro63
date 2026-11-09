# Prévia local do painel e das artes

Execute `npm run preview:design` na pasta do Giro63 e abra http://localhost:3001/admin.

O comando usa SQLite em `exports/design-preview`, com conteúdo demonstrativo de desenvolvimento. Não carrega as credenciais de nuvem nem altera o banco local normal ou o Supabase. O acesso de teste é recriado a cada início e salvo em `exports/local-design-access.json`, fora do Git. O servidor escuta somente neste computador. Os arquivos gerados ficam em `exports/design-preview/instagram`.

Esta rodada permanece local: não fazer commit, push ou deployment antes da aprovação do design.

O estúdio lista matérias publicadas e em revisão, com busca e 20 itens por página. A preparação não exige conexão Meta nem licença social preenchida; o envio continua exigindo as conferências e autorizações existentes. Os créditos ficam apenas na legenda. O endereço da arte e o link da legenda usam a URL pública do próprio portal; a prévia usa https://giro63.vercel.app.

Os formatos são JPEG 1080 × 1440, 1080 × 1920 e 1080 × 1350. Ajustes de texto e posição da fotografia são próprios da arte e não alteram a matéria. Conteúdos demonstrativos servem apenas à revisão visual local e continuam impedidos de envio ao Instagram.

## Modelos de arte

Escolha Fotografia com degradê, Editorial azul ou Editorial claro em cada matéria. Preparações anteriores conservam o modelo original; novas começam no Editorial azul. Salvar e gerar artes aplica a escolha aos três formatos sem modificar os textos da notícia. O guia do sticker é exclusivo da prévia; o JPEG mantém a faixa livre entre 1510 e 1690 px. A migração PostgreSQL foi escrita, mas não aplicada ao Supabase nesta rodada local.

## Ajuste final local

Somente Editorial azul e Editorial claro permanecem disponíveis. O azul usa #102A43, o claro #FBFAF7 e os acentos #ED521A. A curva superior é contínua, sem moldura laranja inferior. No story, conteúdo desce 50 px e rodapé fica em 1680 px; o guia do sticker fica entre resumo e rodapé. A chamada do site alinha à direita da coluna de texto. Legendas não incluem URLs; encerram com “Link da matéria na íntegra nos stories.”. O link copiável permanece disponível no painel.
