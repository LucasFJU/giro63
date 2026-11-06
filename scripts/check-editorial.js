const key=process.env.GEMINI_API_KEY,model=process.env.GEMINI_MODEL||'gemini-3.7-flash';
if(key&&/^[a-z0-9.-]+$/.test(model)){
  try{const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model,{headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(10000)});console.log('Verificação Gemini: modelo '+model+' — HTTP '+response.status+'. Automação permanece conforme controles do painel.');}catch{console.log('Verificação Gemini indisponível. Conferir pelo painel antes de ativar.');}
}else console.log('Gemini pendente. Coleta e geração permanecem pausadas.');
