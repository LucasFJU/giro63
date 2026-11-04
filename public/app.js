document.documentElement.classList.add('js-enabled');
const menu=document.querySelector('.menu-toggle'),links=document.querySelector('#nav-links');
menu?.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));links.classList.toggle('is-open',open);});
const search=document.querySelector('.search-toggle'),panel=document.querySelector('#site-search');
if(search&&panel){
  const wrapper=search.closest('.header-search'),input=panel.querySelector('input'),form=panel.querySelector('form');
  panel.hidden=true;
  const setSearchOpen=(open,restore=false)=>{
    search.setAttribute('aria-expanded',String(open));
    search.setAttribute('aria-label',open?'Fechar busca':'Abrir busca');
    panel.hidden=!open;
    if(open){input.focus({preventScroll:true});}
    else if(restore)search.focus({preventScroll:true});
  };
  search.addEventListener('click',()=>setSearchOpen(panel.hidden));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){event.preventDefault();setSearchOpen(false,true);}});
  document.addEventListener('pointerdown',event=>{if(!panel.hidden&&!wrapper.contains(event.target))setSearchOpen(false);});
  wrapper.addEventListener('focusout',event=>{if(event.relatedTarget&&!wrapper.contains(event.relatedTarget))setSearchOpen(false);});
  input.addEventListener('input',()=>input.setCustomValidity(''));
  form.addEventListener('submit',event=>{
    input.value=input.value.trim();
    if(!input.value){event.preventDefault();input.setCustomValidity('Digite um assunto para pesquisar.');input.reportValidity();}
  });
}
