import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('medição no navegador exige imagem carregada, 50% visível e um segundo contínuo',async()=>{
  let observer,nextId=0;const timers=new Map(),requests=[],listeners=new Map(),imageListeners=new Map();
  const img={complete:true,naturalWidth:100,isConnected:true,addEventListener:(name,fn)=>imageListeners.set(name,fn)};
  const document={visibilityState:'visible',querySelectorAll:()=>[{dataset:{adToken:'token-de-teste'},querySelector:()=>img}],addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  class Observer{constructor(callback){this.callback=callback;observer=this;}observe(){}unobserve(){this.stopped=true;}}
  vm.runInNewContext(readFileSync(new URL('../public/ad-metrics.js',import.meta.url),'utf8'),{window:{IntersectionObserver:Observer,addEventListener(){}},document,IntersectionObserver:Observer,URLSearchParams,setTimeout:(fn,delay)=>{assert.equal(delay,1000);const id=++nextId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),fetch:async(url,options)=>{requests.push({url,options});return {ok:true};}});
  const visible=ratio=>observer.callback([{intersectionRatio:ratio}]);
  visible(.49);assert.equal(timers.size,0);
  visible(.5);assert.equal(timers.size,1);visible(.3);assert.equal(timers.size,0);assert.equal(requests.length,0);
  visible(.7);document.visibilityState='hidden';listeners.get('visibilitychange')();assert.equal(timers.size,0);
  document.visibilityState='visible';img.naturalWidth=0;listeners.get('visibilitychange')();assert.equal(timers.size,0);
  img.naturalWidth=100;imageListeners.get('load')();assert.equal(timers.size,1);
  const callbacks=[...timers.values()];timers.clear();await callbacks[0]();
  assert.equal(requests.length,1);assert.equal(requests[0].url,'/publicidade/exibicao');assert.equal(requests[0].options.body.get('token'),'token-de-teste');assert.equal(observer.stopped,true);
  visible(1);assert.equal(timers.size,0);assert.equal(requests.length,1);
});
