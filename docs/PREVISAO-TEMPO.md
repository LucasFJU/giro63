# Previsão do tempo — prévia local

A integração usa WeatherAPI Free (100 mil chamadas/mês, uso comercial permitido conforme https://www.weatherapi.com/pricing, conferido em 09/11/2026). Nenhum plano pago foi contratado.

1. Crie uma conta gratuita em https://www.weatherapi.com/signup.aspx e copie sua chave no painel do serviço.
2. Abra `.env.weather.local` na raiz do projeto. Cole a chave após `WEATHER_API_KEY=` e salve. O arquivo está ignorado pelo Git.
3. Reinicie com `npm run preview:design`. Abra http://localhost:3001/ .

Sem chave, o bloco mostra indisponibilidade e nunca dados fictícios. Nenhum cadastro no provedor foi feito automaticamente. A chave fica apenas no servidor. Para a inicialização normal, use `node --env-file=.env.weather.local src/server.js`.

Palmas é o padrão. A cidade escolhida é guardada só no navegador, como preferência funcional; não usa IP para determinar a cidade. O botão “Usar minha localização” solicita a permissão do navegador somente ao clicar. Coordenadas são arredondadas a 0,1 grau antes da transmissão por POST ao servidor e ao provedor, sem gravar no banco, em cookies ou no armazenamento local. Cache limitado em memória por região dura 30 minutos. A cidade manual continua disponível em caso de recusa ou falha. O visitante não faz conexão direta com o provedor. Temperatura, mínima, máxima, condição, chuva diária e horário da observação são exibidos, com atribuição. Cache de 30 minutos por cidade, requisições simultâneas agrupadas, prazo de cinco segundos, falhas limitadas a uma tentativa por minuto por cidade. Dados com mais de três horas não são exibidos como atuais. Reiniciar o servidor limpa o cache em memória.

Publicação autorizada em 09/11/2026. Configure WEATHER_API_KEY como segredo em Production e Preview. A página de privacidade inclui explicação sobre o provedor, preferência de cidade e localização opcional. Nenhuma migração de banco é necessária.
