(()=>{
 const widget=document.querySelector('#weather-widget');if(!widget)return;
 const select=widget.querySelector('select'),status=widget.querySelector('[data-weather-status]'),data=widget.querySelector('[data-weather-data]');
 const locate=widget.querySelector('[data-weather-locate]'),locationStatus=widget.querySelector('[data-weather-location-status]');
 let controller,locationAttempt=0;
 try{const city=localStorage.getItem('giro63.weather-city');if([...select.options].some(o=>o.value===city))select.value=city;}catch{}
 async function load(coordinates=null){
  controller?.abort();controller=new AbortController();const current=controller;

  status.hidden=false;status.textContent='Consultando a previsão…';data.hidden=true;widget.setAttribute('aria-busy','true');
  try{
   const response=await fetch(coordinates?'/api/tempo/localizacao':'/api/tempo?cidade='+encodeURIComponent(select.value),coordinates?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(coordinates),signal:current.signal}:{signal:current.signal});if(!response.ok)throw Error();const value=await response.json();if(controller!==current)return;

   if(coordinates){locationStatus.textContent='Previsão para '+value.name+' · localização aproximada';}
   widget.querySelector('[data-weather-condition]').textContent=value.condition;
   widget.querySelector('[data-weather-temp]').textContent=value.temperature+' °C';
   widget.querySelector('[data-weather-range]').textContent=value.minimum+'° / '+value.maximum+'°';
   widget.querySelector('[data-weather-rain]').textContent=value.rain+'%';
   widget.querySelector('[data-weather-updated]').textContent='Atualizado em '+new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).format(new Date(value.updatedAt));
   status.hidden=true;data.hidden=false;
  }catch(error){if(error.name!=='AbortError'&&controller===current){status.textContent='Previsão indisponível no momento. Tente novamente mais tarde.';if(coordinates){locationStatus.textContent='Não foi possível consultar sua região. Mantida a cidade selecionada.';load();}}}
  finally{if(controller===current)widget.removeAttribute('aria-busy');}
 }
 select.addEventListener('change',()=>{locationAttempt++;locate.disabled=false;locationStatus.textContent='A localização é usada somente com sua permissão.';try{localStorage.setItem('giro63.weather-city',select.value);}catch{}load();});

 locate.addEventListener('click',()=>{
  if(!navigator.geolocation){locationStatus.textContent='Seu navegador não oferece localização. Escolha uma cidade.';return;}
  const attempt=++locationAttempt;locate.disabled=true;locationStatus.textContent='Aguardando sua permissão para consultar a região…';
  navigator.geolocation.getCurrentPosition(position=>{
   if(attempt!==locationAttempt)return;locate.disabled=false;
   load({latitude:Math.round(position.coords.latitude*10)/10,longitude:Math.round(position.coords.longitude*10)/10});
  },error=>{
   if(attempt!==locationAttempt)return;locate.disabled=false;
   locationStatus.textContent=error.code===1?'Localização não autorizada. Mantida a cidade selecionada.':'Não foi possível obter sua localização. Escolha uma cidade.';
  },{enableHighAccuracy:false,timeout:10000,maximumAge:300000});
 });
 load();
})();
