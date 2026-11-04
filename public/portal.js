/* Optional first-party audience measurement. No event is sent before consent. */
const preferences=document.querySelectorAll('.cookie-preferences'),banner=document.querySelector('#cookie-banner');
if(banner){
  const csrf=document.querySelector('meta[name="csrf-token"]').content,token=document.querySelector('meta[name="audience-token"]')?.content;
  let choice=null,sent=false,pending=false,returnFocus=null;
  const feedback=banner.querySelector('.cookie-feedback');
  const post=(url,values)=>fetch(url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:csrf,...values})});
  async function measure(){if(choice!=='accepted'||sent||!token||document.visibilityState!=='visible')return;sent=true;try{const result=await post('/audiencia/visualizacao',{token});if(!result.ok)sent=false;}catch{sent=false;}}
  preferences.forEach(button=>{button.hidden=false;button.addEventListener('click',()=>{returnFocus=button;banner.hidden=false;banner.querySelector('#cookie-title').focus({preventScroll:true});});});
  banner.querySelectorAll('[data-cookie-choice]').forEach(button=>button.addEventListener('click',async()=>{
    if(pending)return;pending=true;feedback.textContent='Salvando preferência…';banner.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{const response=await post('/preferencias-cookies',{choice:button.dataset.cookieChoice});if(!response.ok)throw Error();choice=button.dataset.cookieChoice;banner.hidden=true;feedback.textContent='';returnFocus?.focus({preventScroll:true});await measure();}
    catch{feedback.textContent='Não foi possível salvar. Tente novamente. Estatísticas não foram autorizadas nesta tentativa.';}
    finally{pending=false;banner.querySelectorAll('button').forEach(b=>b.disabled=false);}
  }));
  async function refresh(){try{const response=await fetch('/preferencias-cookies',{cache:'no-store'});if(!response.ok)throw Error();choice=(await response.json()).choice;banner.hidden=!!choice;await measure();}catch{choice=null;banner.hidden=false;feedback.textContent='Não foi possível consultar a preferência. Você pode tentar salvá-la novamente.';}}
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});window.addEventListener('pageshow',event=>{if(event.persisted)refresh();});refresh();
}
