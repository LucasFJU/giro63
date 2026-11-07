# Publicação e conferência editorial

A matéria continua usando os estados públicos rascunho, revisão e publicado. A associação com a automação guarda códigos de bloqueio, motivos de conferência posterior, fotografia aprovada, consumo de cota e identificação dos editores. O cadastro de autor e os históricos anteriores são preservados.

## Aprovar e publicar

1. Abra a matéria na Central de revisão ou em Não preparados.
2. Confira os fatos e a fonte. Resolva cada bloqueio, registrando referências/correções (mínimo 20 caracteres). Alertas desconhecidos precisam de classificação explícita. A autorização cadastral da fonte é obrigatória mesmo após conferência manual.
3. Selecione a fotografia sugerida ou envie a imagem original. Preencha fotógrafo, fonte, endereço de comprovação, licença e descrição. Confirme autorização e contexto. A autorização do texto não libera fotografias.
4. Use **Aprovar imagem e publicar** para colocar no ar. **Salvar rascunho** apenas salva, inclusive quando aprova a imagem. Aprovar uma fotografia não agenda a publicação depois.
5. Temas sensíveis, tags sugeridas, cidade ausente e texto curto completo podem ficar em **Publicadas para conferir**. Ali é possível editar, concluir a conferência ou retirar a matéria. A conclusão registra editor e data, sem apagar os motivos históricos.

Novas sugestões de foto começam pendentes. Sem aprovação específica, a geração prepara a matéria para o editor e não publica usando uma arte genérica. Números e citações são comparados com o material recebido; suspeitas e atribuições precisam ser preservadas. Esses controles não equivalem a apuração independente.

As cotas são consumidas na primeira publicação da matéria importada, com atualização atômica no banco. Retirar/republicar ou salvar novamente não duplica a contagem. Permanecem: fila de 20 (até quatro nacionais), dez publicações/dia (até três nacionais), vinte chamadas Gemini/dia, horário de São Paulo e prioridade das notícias do dia. Revisões antigas não são publicadas em lote; recebem bloqueio de conferência legada até aprovação explícita do editor.

## Migração e recuperação

SQLite: `node scripts/migrate-editorial-footers.js` cria backup completo em `backups/` antes das colunas e dos rodapés. O resultado lista IDs com avisos não reconhecidos. PostgreSQL: aplicar `supabase/migrations/20261107190000_editorial_review.sql` após snapshot privado das matérias e associações. Incluir novas colunas no dump habitual do schema giro63. As imagens continuam no backup do Storage.

A atualização do crédito troca somente o parágrafo padronizado exato e único da fonte/URL associada. Preserva conteúdo editorial, menções jornalísticas à IA e complementos posteriores. Formatos diferentes permanecem intactos para conferência. Registros internos de geração não são removidos.

A etiqueta geográfica na inicial aparece apenas quando há cidade/região registrada; cidade vazia não recebe Tocantins. Na geração, tags com Tocantins/tocantinense exigem menção no material da fonte.
