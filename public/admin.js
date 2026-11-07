const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const articleSearch=document.querySelector('#article-search'),statusSelect=document.querySelector('#status-filter'),categorySelect=document.querySelector('#category-filter');
if(articleSearch){
 const params=new URLSearchParams(location.search);if(['draft','review','published'].includes(params.get('status')))statusSelect.value=params.get('status');
 const apply=()=>{let count=0;document.querySelectorAll('tr[data-status]').forEach(row=>{const visible=(!statusSelect.value||row.dataset.status===statusSelect.value)&&(!categorySelect.value||row.dataset.category===categorySelect.value)&&normalize(row.dataset.search).includes(normalize(articleSearch.value.trim()));row.hidden=!visible;if(visible)count++;});document.querySelector('#article-count').textContent=count+' matérias';document.querySelector('#filter-empty').hidden=count!==0;};
 articleSearch.addEventListener('input',apply);statusSelect.addEventListener('change',apply);categorySelect.addEventListener('change',apply);document.querySelector('#clear-filters').addEventListener('click',()=>{articleSearch.value='';statusSelect.value='';categorySelect.value='';apply();});apply();
}
const editorForm=document.querySelector('.editor-form');
if(editorForm){let dirty=false;const feedback=document.querySelector('.editor-feedback');const status=()=>{dirty=true;feedback.textContent='Alterações não salvas. Salve o rascunho para continuar depois.';feedback.classList.add('is-dirty');};editorForm.addEventListener('form-failed',status);editorForm.addEventListener('input',status);editorForm.addEventListener('change',status);editorForm.addEventListener('submit',event=>{if(!event.defaultPrevented){dirty=false;feedback.textContent='Salvando matéria…';}});window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
 ['title','summary'].forEach(id=>{const input=document.getElementById(id),counter=document.createElement('span');counter.className='field-counter';input.after(counter);const update=()=>counter.textContent=input.value.length+' / '+input.maxLength+' caracteres';input.addEventListener('input',update);update();});
 const rich=document.querySelector('#body-editor'),wordCount=document.createElement('p');wordCount.className='field-help';rich.after(wordCount);const count=()=>{const words=(rich.innerText||'').trim().split(/\s+/).filter(Boolean).length;wordCount.textContent=words+' palavras · aproximadamente '+Math.max(1,Math.ceil(words/200))+' min de leitura';};rich.addEventListener('input',count);count();

}

const bulkSelect=document.getElementById('bulk-select-page');
if(bulkSelect){const items=[...document.querySelectorAll('[data-bulk-item]')];bulkSelect.addEventListener('change',()=>items.forEach(i=>i.checked=bulkSelect.checked));items.forEach(i=>i.addEventListener('change',()=>{bulkSelect.checked=items.every(i=>i.checked);bulkSelect.indeterminate=items.some(i=>i.checked)&&!bulkSelect.checked;}));}

const adminToggle=document.querySelector('.admin-menu-toggle');
if(adminToggle)adminToggle.addEventListener('click',()=>{const open=adminToggle.getAttribute('aria-expanded')!=='true';adminToggle.setAttribute('aria-expanded',String(open));document.querySelector('.editorial-nav').classList.toggle('menu-open',open);});
const recordSearch=document.querySelector('#record-search');
if(recordSearch)recordSearch.addEventListener('input',()=>{let count=0;document.querySelectorAll('[data-record-search]').forEach(row=>{row.hidden=!normalize(row.dataset.recordSearch).includes(normalize(recordSearch.value.trim()));if(!row.hidden)count++;});document.querySelector('#record-empty').hidden=count>0;});
document.addEventListener('click',event=>{const button=event.target.closest('[data-confirm]');if(button&&!confirm(button.dataset.confirm)){event.preventDefault();event.stopImmediatePropagation();}},true);
if(document.querySelector('.form-error'))document.querySelectorAll('.editor-form details').forEach(d=>d.open=true);
