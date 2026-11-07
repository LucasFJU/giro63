/* Keep entered values on server errors and network failures. */
document.querySelectorAll('form').forEach(form=>{
  if((form.getAttribute('method')||'get').toLowerCase()!=='post')return;
  let sending=false,completed=false;
  const status=document.createElement('p');status.className='form-progress';status.setAttribute('role','status');form.append(status);
  function fieldError(field,message){
    if(!field||field.type==='hidden')return;
    const id=(field.id||field.name)+'-validation';let note=document.getElementById(id);
    if(!note){note=document.createElement('p');note.id=id;note.className='field-error';field.after(note);}
    note.textContent=message;field.setAttribute('aria-invalid','true');field.setAttribute('aria-describedby',[...(field.getAttribute('aria-describedby')||'').split(' ').filter(Boolean),id].filter((v,i,a)=>a.indexOf(v)===i).join(' '));
  }
  try{const errors=JSON.parse(document.querySelector('meta[name=form-errors]')?.content||'{}');for(const [name,message] of Object.entries(errors))fieldError(form.elements.namedItem(name)||form.querySelector('#'+CSS.escape(name)),message);}catch{}
  form.addEventListener('invalid',event=>{fieldError(event.target,event.target.validationMessage);},true);
  form.addEventListener('input',event=>{const field=event.target;if(field.getAttribute('aria-invalid')==='true'){field.removeAttribute('aria-invalid');const note=document.getElementById((field.id||field.name)+'-validation');if(note)note.textContent='';}});
  form.querySelectorAll('input[type=file]').forEach(input=>{
    const note=document.createElement('p');note.className='upload-feedback';note.setAttribute('role','status');input.after(note);
    input.addEventListener('change',()=>{const file=input.files[0];input.setCustomValidity('');if(!file){note.textContent='Nenhum novo arquivo selecionado.';return;}let error='';if(file.size>Number(input.dataset.maxMb||8)*1024*1024)error='Selecione uma imagem de até '+(input.dataset.maxMb||8)+' MB.';else if(!['image/jpeg','image/png','image/webp'].includes(file.type))error='Selecione uma imagem JPG, PNG ou WebP estática.';note.textContent=error||file.name+' · '+(file.size/1024/1024).toFixed(2)+' MB';input.setCustomValidity(error);});
  });
  form.addEventListener('submit',async event=>{
    if(event.defaultPrevented)return;event.preventDefault();if(sending)return;
    if(!form.reportValidity())return;
    const data=new FormData(form,event.submitter);const multipart=form.enctype==='multipart/form-data';
    const buttons=[...form.querySelectorAll('button')].filter(b=>b.type==='submit');
    sending=true;completed=false;form.classList.add('form-busy');form.setAttribute('aria-busy','true');buttons.forEach(b=>b.disabled=true);status.textContent=multipart?'Enviando e processando imagem e conteúdo…':'Enviando…';
    try{
      const response=await fetch(form.getAttribute('action')||window.location.href,{method:'POST',credentials:'same-origin',body:multipart?data:new URLSearchParams([...data].map(([key,value])=>[key,String(value)]))});
      if(response.redirected&&response.ok){const html=await response.text();const doc=new DOMParser().parseFromString(html,'text/html');const flash=doc.querySelector('.flash')?.textContent;try{if(flash)sessionStorage.setItem('giro63-form-feedback',flash);}catch{}completed=true;window.location.assign(response.url);return;}
      const html=await response.text(),doc=new DOMParser().parseFromString(html,'text/html');
      const renewed=doc.querySelector('meta[name=csrf-token]')?.content;if(renewed&&form.elements.namedItem('_csrf'))form.elements.namedItem('_csrf').value=renewed;
      const message=doc.querySelector('.form-error,[role=alert],.error-main p')?.textContent||'Não foi possível salvar. Revise os campos e tente novamente.';
      status.textContent=message+(multipart?' Seus textos foram mantidos. Confira ou selecione novamente a imagem.':'');
      let mapped={};try{mapped=JSON.parse(doc.querySelector('meta[name=form-errors]')?.content||'{}');}catch{}
      for(const [name,message] of Object.entries(mapped))fieldError(form.elements.namedItem(name)||form.querySelector('#'+CSS.escape(name)),message);
      const errors=[...doc.querySelectorAll('[data-error-for]')];
      for(const error of errors)fieldError(form.elements.namedItem(error.dataset.errorFor),error.textContent);
      if(!errors.length&&!Object.keys(mapped).length){
        let names=[];if(/imagem|arquivo|8 MB|megapixel/i.test(message))names=['image'];else if(/senha|incorretos/i.test(message))names=['email','password'];else if(/fontes|crédito/i.test(message))names=['sources','credit'];else if(/término|início/i.test(message))names=['ends_at','starts_at'];
        for(const name of names)fieldError(form.elements.namedItem(name),message);
      }
      const first=form.querySelector('[aria-invalid=true]');if(first)first.focus();else{status.tabIndex=-1;status.focus();}
    }catch{status.textContent='Falha de conexão. Os campos foram mantidos. Tente novamente; se o envio anterior tiver sido concluído, confira a lista antes de repetir.';}
    finally{if(!completed)form.dispatchEvent(new Event('form-failed'));sending=false;form.classList.remove('form-busy');form.removeAttribute('aria-busy');buttons.forEach(b=>b.disabled=false);}
  });
});
document.querySelectorAll('[data-error-for]').forEach(note=>{const input=document.getElementById(note.dataset.errorFor);if(input){input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby',note.id);}});
const firstError=document.querySelector('[aria-invalid=true]');if(firstError)firstError.focus();
try{const message=sessionStorage.getItem('giro63-form-feedback');if(message&&!document.querySelector('.flash')){const note=document.createElement('div');note.className='container flash';note.setAttribute('role','status');note.textContent=message;document.querySelector('main')?.prepend(note);}sessionStorage.removeItem('giro63-form-feedback');}catch{}
window.addEventListener('pageshow',()=>{document.querySelectorAll('.form-busy').forEach(form=>{form.classList.remove('form-busy');form.removeAttribute('aria-busy');form.querySelectorAll('button').forEach(b=>b.disabled=false);});});

for(const key of ['privacy','terms']){const text=document.getElementById(key+'_text'),review=document.getElementById(key+'_reviewed');text?.addEventListener('input',()=>{review.checked=false;});}
for(const key of ['legal_owner','privacy_email'])document.getElementById(key)?.addEventListener('input',()=>{for(const name of ['privacy_reviewed','terms_reviewed']){const control=document.getElementById(name);if(control)control.checked=false;}});
