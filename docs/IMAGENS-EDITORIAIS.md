# Imagens editoriais

Os campos de fotógrafo, fonte, endereço original, licença, legenda e texto alternativo são editados na matéria. O crédito legado é preservado; ao preencher fotógrafo e fonte, passa a ser montado a partir desses campos.

O ponto de atenção horizontal/vertical gera três arquivos independentes: capa de chamada 1200×675, miniatura 640×388 e compartilhamento 1200×630. A página da matéria conserva a imagem inteira recebida. Os originais editoriais, recortes e variantes ficam no Storage em nuvem ou na pasta uploads em modo local. O recorte não altera o original. As prévias acompanham os controles por teclado; o WhatsApp pode manter a prévia anterior em cache.

A automação tenta obter apenas metadados da imagem da mesma publicação da Agência Brasil. Não extrai novamente o corpo da notícia. A descoberta tem limite de tempo/tamanho/domínios, valida DNS e redirecionamentos e não acessa endereços privados. Se falhar ou não houver tempo no lote, a arte neutra é preservada e o editor pode pedir uma sugestão pela tela de edição.

Todas as sugestões começam pendentes, inclusive quando o crédito da agência é identificado. A licença nunca é inferida ou liberada automaticamente. Apenas um editor pode aprovar, preenchendo os dados, confirmando direitos e contexto. O arquivo é baixado no servidor, validado de verdade como JPG/PNG/WebP estático, otimizado e salvo no armazenamento do Giro63. Não há hotlink nas capas públicas. Uma falha deixa a capa anterior no banco. A aprovação guarda responsável/data; ela não dispara nem conta como nova publicação de uma matéria já publicada.

Inclua `article_image_suggestions` e as novas colunas `photo_*` no backup PostgreSQL/SQLite; inclua também os arquivos Storage/pasta uploads, agora com recortes em crops/. Backup anterior: backups/2026-11-06T19-21-30-093Z (local) e giro63_backup_20261106.articles_before_images (snapshot de dados remoto).

Autoria das matérias da automação: Giro63 - Redação. A informação de apoio de IA permanece no fim do texto e é independente do crédito da fotografia.

Para o lote inicial, fotografias de terceiros com direitos reservados foram substituídas por imagens de arquivo da Agência Brasil ou por fotografias com licença explícita do Wikimedia Commons. Legendas identificam arquivo/ilustração e não atribuem a imagem a acontecimentos que ela não retrata. Derivados de fotos CC BY-SA mantêm a mesma licença, com indicação de recorte, autoria, link original e link de licença. O manifesto operacional com as escolhas fica em exports/ (não versionado); os dados definitivos são os campos gravados em cada matéria.
