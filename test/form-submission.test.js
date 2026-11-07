import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('botões action não substituem o destino do formulário e preservam a ação escolhida',async()=>{
 let submit,requested,selected,redirect;
 const form={action:{toString:()=> '[object RadioNodeList]'},enctype:'multipart/form-data',getAttribute:n=>({method:'post',action:'/admin/noticias/38'}[n]),append(){},addEventListener:(type,fn)=>{if(type==='submit')submit=fn;},querySelectorAll:()=>[],querySelector:()=>null,reportValidity:()=>true,classList:{add(){},remove(){}},setAttribute(){},removeAttribute(){},dispatchEvent(){},elements:{namedItem:()=>null}};
 const document={querySelectorAll:selector=>selector==='form'?[form]:[],querySelector:()=>null,getElementById:()=>null,createElement:()=>({setAttribute(){}})};
 vm.runInNewContext(readFileSync(new URL('../public/forms.js',import.meta.url),'utf8'),{document,window:{location:{href:'https://example.test/admin/noticias/38',assign:url=>redirect=url},addEventListener(){}},FormData:class{constructor(f,button){selected=button.value;}},fetch:async url=>{requested=url;return {redirected:true,ok:true,url:'https://example.test/admin/materias',text:async()=>''};},DOMParser:class{parseFromString(){return {querySelector:()=>null};}},sessionStorage:{getItem(){},removeItem(){},setItem(){}},Event:class{}});
 await submit({defaultPrevented:false,preventDefault(){},submitter:{value:'published'}});
 assert.equal(requested,'/admin/noticias/38');assert.equal(selected,'published');assert.equal(redirect,'https://example.test/admin/materias');
});
