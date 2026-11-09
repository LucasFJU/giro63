# Fila e publicação — novembro de 2026

A fila ativa comporta 20 itens, com até quatro nacionais. Excedentes ficam em `waiting` e voltam a `queued` quando houver vaga. Estados são texto livre nos dois bancos, sem enum ou alteração de coluna. A sequência usa o contador diário `published`, já transacional: posições 4, 8 e 10 preferem nacionais; as demais preferem regionais. Ausência de candidatos permite o outro grupo, respeitando três nacionais e dez publicações. Revisões não avançam esse contador.

Só itens sem matéria criada são expirados na virada do dia em São Paulo. A proteção de 48 horas permanece. Descartes antigos não voltam automaticamente. Atualizações de fontes são registradas em eventos e preservam o motivo anterior.

Fotos próprias identificadas da Agência Brasil podem ser importadas para uso jornalístico com crédito, conforme https://www.gov.br/pt-br/servicos/acessar-material-fotojornalistico-gratuitamente (consultado em 09/11/2026). Créditos incompletos, parceiros, direitos reservados e G1 exigem aprovação editorial. O site de origem não basta para liberar uma foto. Não há preenchimento fictício de autoria. Falha no download mantém revisão prévia. A opção de publicação e a pausa continuam valendo.

A migração de entrega guarda cópias privadas das tabelas afetadas antes do novo código. O backup habitual inclui estados, contadores, eventos e imagens. Instagram permanece em preparação.

Política atualizada em 09/11/2026: publicação com fotografia original de fonte cadastrada, crédito, legenda e descrição identificados, marcada PHOTO_REVIEW quando direitos/contexto ainda exigirem conferência. Não registra autorização fictícia. Restrições explícitas e falta de crédito continuam bloqueando a imagem. Não libera automaticamente uso em redes sociais. GitHub continua único agendador; execuções solicitadas a cada duas horas, sem garantia de pontualidade do provedor. Cotas editoriais continuam iguais.
