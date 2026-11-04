/* Progressive enhancement: links and filters remain usable without JavaScript. */
const navigation=document.querySelector('#nav-links');
const more=navigation?.querySelector('.nav-more');
if(more){
  const button=more.querySelector('button'),panel=more.querySelector('.nav-more-panel');
  const categories=[...navigation.querySelectorAll('[data-nav-category]')];
  const close=()=>{panel.hidden=true;button.setAttribute('aria-expanded','false');};
  button.addEventListener('click',()=>{const open=button.getAttribute('aria-expanded')!=='true';panel.hidden=!open;button.setAttribute('aria-expanded',String(open));});
  document.addEventListener('click',event=>{if(!more.contains(event.target))close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){close();button.focus();}});
  let queued=false;
  function fit(){
    queued=false;
    const focused=document.activeElement;
    for(const link of categories)navigation.insertBefore(link,more);
    more.hidden=true;close();
    if(window.matchMedia('(max-width:760px)').matches)return;
    const available=navigation.clientWidth;
    const gap=parseFloat(getComputedStyle(navigation).columnGap)||0;
    const links=[...navigation.querySelectorAll(':scope > a')];
    const widths=links.map(link=>link.getBoundingClientRect().width);
    let total=widths.reduce((sum,width)=>sum+width,0)+gap*(links.length-1);
    if(total<=available)return;
    more.hidden=false;
    total+=more.getBoundingClientRect().width+gap;
    for(let i=categories.length-1;i>=0&&total>available;i--){
      panel.prepend(categories[i]);total-=widths[i+2]+gap;
    }
    if(panel.contains(focused)){panel.hidden=false;button.setAttribute('aria-expanded','true');focused.focus();}
  }
  function schedule(){if(!queued){queued=true;requestAnimationFrame(fit);}}
  new ResizeObserver(schedule).observe(navigation);
  document.fonts.ready.then(schedule);schedule();
}
const citySearch=document.querySelector('#city-search');
if(citySearch){
  citySearch.closest('.city-finder').hidden=false;
  const cityList=document.querySelector('.city-links');
  cityList.hidden=true;
  const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
  const cities=[...document.querySelectorAll('[data-city-name]')];
  citySearch.addEventListener('input',()=>{
    const term=normalize(citySearch.value);let count=0;
    cityList.hidden=!term;
    for(const link of cities){link.hidden=!normalize(link.dataset.cityName).includes(term);if(!link.hidden)count++;}
    document.querySelector('.city-empty').hidden=!term||count>0;
  });
}
