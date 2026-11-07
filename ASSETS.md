# Fontes e fotografias

As fontes atuais são Merriweather para títulos e manchetes e Inter para texto e interface, distribuídas sob SIL Open Font License. As licenças estão junto aos arquivos em `public/fonts`. Os arquivos são servidos localmente. As fontes Source Serif 4 e Source Sans 3 da versão anterior permanecem arquivadas, sem uso no tema atual.

Fotografias ilustrativas baixadas do Unsplash, utilizadas sob a [licença Unsplash](https://unsplash.com/license):

| Arquivo | Origem |
|---|---|
| `public/images/cerrado.jpg` | https://images.unsplash.com/photo-1500530855697-b586d89ba3ee |
| `public/images/cidade.jpg` | https://images.unsplash.com/photo-1449824913935-59a10b8d2000 |
| `public/images/campo.jpg` | https://images.unsplash.com/photo-1500382017468-9049fed747ef |
| `public/images/cultura.jpg` | https://images.unsplash.com/photo-1513364776144-60967b0f800f |
| `public/images/saude.jpg` | https://images.unsplash.com/photo-1576091160399-112ba8d25d1d |

As fotografias não são registros jornalísticos dos locais citados. As legendas das matérias demonstrativas informam isso. Os nomes de arquivo são internos e não identificam o lugar fotografado.

Os arquivos oficiais enviados pelo usuário foram copiados sem alteração, preservando a transparência:

- `public/images/giro63-logo-oficial.png`: versão horizontal original, preservada no projeto.
- `public/images/giro63-logo-branca.png`: versão branca enviada pelo usuário para a faixa laranja do cabeçalho.
- `public/images/giro63-simbolo-oficial.png`: símbolo G63 como ícone da aba.
- `public/images/giro63-assinatura-oficial.png`: versão com assinatura no rodapé, exibida em branco por CSS sobre o azul, sem fundo; o arquivo original permanece intacto.

O laranja do tema, dos destaques e da faixa de últimas notícias é `#ED521A`, definido pelo usuário. Os arquivos originais da logo permanecem preservados. As versões vetoriais anteriores estão arquivadas e não são utilizadas. `npm run brand` prepara as fontes e preserva os arquivos oficiais.

## Fotografias do Tocantins

- `public/images/jalapao.jpg`: [Dunas – Jalapão – Tocantins – Brasil](https://commons.wikimedia.org/wiki/File:Dunas_-_Jalap%C3%A3o_-_Tocantins_-_Brasil.jpg), de Marcelo85photo, sob [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Redimensionada para 1800 px e recomprimida; recorte de exibição feito por CSS. A versão adaptada mantém a mesma licença.
- `public/images/palmas.jpg`: [Praça dos Girassóis, Palmas-TO](https://commons.wikimedia.org/wiki/File:Pra%C3%A7a_dos_girassois,_Palmas-TO.jpg), de Danniel3d, sob [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Arquivo preservado, com recorte de exibição feito por CSS.

As legendas das matérias que utilizam essas imagens apresentam autoria, fonte, modificações e links das licenças.

- Login: imagem fornecida pelo usuário Duna-Dourada-scaled.jpg, copiada sem alterações para public/images/login-dunas.jpg. A camada azul é aplicada apenas via CSS.

## Versões leves para leitura — 07/11/2026

O cabeçalho, login e rodapé usam derivados WebP transparentes das marcas originais: giro63-logo-branca.webp (17.130 bytes) e giro63-assinatura-oficial.webp (27.668 bytes), largura de 640 px. Os PNGs originais foram preservados para novas exportações. A arte ilustrativa Giro63 também possui versões responsivas em public/images/responsive.

Recortes editoriais novos no Storage recebem o tamanho no nome e versões de 160, 320, 640, 960 e 1600 px quando couberem no original. O build atualiza somente os recortes de exibição antigos de photo_cover e photo_thumb, sem apagar arquivos ou alterar a foto original e o recorte social existente. As atualizações são condicionadas ao endereço anterior para preservar mudanças da redação; builds seguintes ignoram os já atualizados.
