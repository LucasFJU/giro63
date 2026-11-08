# Instagram Giro63

## Funcionamento

A integração usa Instagram API com Instagram Login para a conta empresarial @port.algiro63. Não depende de uma plataforma paga. O modo inicial é Preparação. A integração não publica o acervo anterior e não habilita cobranças nem upgrades.

Matérias reais em revisão ou publicadas recebem a opção Instagram. A legenda usa o título, o resumo editorial (ou o primeiro parágrafo, se não houver resumo), fontes, crédito e até três hashtags das tags. Não há nova geração pelo Gemini e suas cotas permanecem independentes. Os textos sociais são editáveis. A preparação não publica conteúdo.

Artes JPEG: feed 1080×1440, adaptação 1080×1350 e story 1080×1920. Renderização usa os arquivos Source Serif 4/Source Sans 3 locais e a marca oficial. O texto vira contornos vetoriais antes da rasterização. Títulos/resumos que não cabem exigem ajuste, sem redução ilegível ou corte de informações. Ajuste o enquadramento e confira cada proporção antes de aprovar. A imagem tem chamada ao portal; links na legenda e na arte não são botões clicáveis. Stickers de link ficam para inclusão manual no Instagram.

O envio exige publicação no site, conferência editorial concluída, ausência de bloqueios factuais, fotografia elegível e autorização social específica. Esta autorização guarda editor, data, referência e impressão digital da fotografia/créditos. Trocar a foto invalida a autorização. O fluxo não assume que licença para o site permita publicação social.

## Configuração Meta e Vercel

1. Na conta Meta autorizada, criar um aplicativo com Instagram e o caso de uso Instagram Login. Não contratar intermediários ou produtos pagos.
2. Configurar o retorno OAuth exato `https://giro63.vercel.app/integracoes/instagram/callback` e a URL do site. Informar privacidade/termos do portal após revisão dos dados legais. Se a Meta exigir revisão do aplicativo, verificação empresarial ou autorizações adicionais, concluí-las pelo procedimento oficial; não contornar essas exigências.
3. Configurar `INSTAGRAM_APP_ID` (ID do aplicativo Instagram), `INSTAGRAM_APP_SECRET` (Secret) e `INSTAGRAM_GRAPH_VERSION=v24.0` na Vercel. Não usar o ID de outro produto, não colocar valores em arquivos versionados ou no navegador.
4. Abrir Painel → Instagram → Conectar Instagram e autorizar `instagram_business_basic` e `instagram_business_content_publish`. É aceita somente a conta Empresa com username port.algiro63. O suporte real a stories e as permissões são confirmados com o teste da conta.
5. Selecionar uma matéria real publicada e conferida, preparar artes, revisar legenda e autorizar a foto para redes sociais. Solicitar Publicar teste real no feed e story. Conferir os dois destinos no perfil.
6. No painel Instagram, confirmar o teste e escolher Publicar novas matérias automaticamente. O sistema exige os dois resultados publicados no banco antes de habilitar. Não ativar sem confirmação real.

A conta Meta precisa ser autenticada pelo responsável. Cadastro de desenvolvedor, termos e eventuais verificações da Meta exigem a participação do titular. Se não houver credenciais do aplicativo, o painel continua preparando/downloadando sem enviar.

## Fila, retomada e limites

A tarefa é criada na mesma transação editorial da notícia. Novas publicações após a ativação tornam-se candidatas automáticas; matérias publicadas antes disso exigem teste explícito do editor. Salvar uma revisão não publica no Instagram. Concluir a conferência libera somente candidatos que já pertenciam ao período ativo.

Vercel waitUntil tenta processar após salvar; o workflow instagram-publishing.yml retoma a fila às :47 de cada hora com três lotes limitados. Usa OIDC de uso único, audiência giro63-instagram e valida repositório, branch e arquivo exatos. Não guarda chaves do banco ou da Meta no GitHub. Prévia e execução local não enviam para a Meta. A preparação das artes pode exigir um lote e o envio ocorrer no seguinte. Atrasos do GitHub Actions e limites da Meta podem adiar o processamento.

Cada destino tem container, resultado e tentativas próprios. Somente rejeição explícita de proporção adapta o feed para 4:5. Falha no story não republica o feed. Estado publishing é persistido antes da chamada externa: respostas incertas só são verificadas, nunca reenviadas automaticamente. Se o container confirmar PUBLISHED, o resultado é reconhecido mesmo que o ID final não tenha sido retornado. Caso contrário, o editor confere o Instagram; Tentar novamente age somente nos erros definitivos. Cancelar não apaga publicações já feitas.

Alteração anterior ao envio invalida as artes e textos preparados. Alteração após publicação ou tentativa incerta gera aviso e cancela os destinos restantes; não publica nova versão automaticamente. Arquivar, excluir ou retirar de publicação cancela envios ainda pendentes.

A automação para de enviar quando pausada ou com conexão expirada. Tokens de longa duração são renovados quando faltam menos de sete dias, respeitando o intervalo mínimo. Tokens ficam cifrados com AES-256-GCM e chave derivada do SESSION_SECRET; rotacioná-lo exige reconectar o Instagram. Não há tokens em HTML, logs ou URLs de artes permanentes.

## Persistência e backup

Aplicar a migração 20261108010000_instagram.sql no schema privado giro63 antes do deploy. Inclui conexão cifrada, estados OAuth temporários, preparações, destinos e histórico. RLS e privilégios negam acesso anon/authenticated. Incluir essas tabelas no dump do schema.

O build confere/cria o bucket privado giro63-social. As prévias são servidas apenas por rotas autenticadas; para a Meta são emitidos endereços assinados com validade de 24 horas. Incluir este bucket no backup do Storage. Localmente, artes ficam em GIRO63_DATA_DIR/instagram e o comando backup as inclui. Fontes e marca pertencem ao código versionado.

GitHub Actions, Storage e Vercel consomem as franquias existentes. Não se promete uso ilimitado gratuito: se houver limite, o trabalho fica pendente para o editor, sem habilitar cobranças ou upgrade automático.
