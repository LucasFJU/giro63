import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {mountWeather,normalizeWeather,weatherCities} from '../src/weather.js';
const now=Date.parse('2026-11-09T16:00:00Z');
const payload={current:{temp_c:31.5,last_updated_epoch:now/1000,condition:{text:'Parcialmente nublado'}},forecast:{forecastday:[{date:'2026-11-09',day:{mintemp_c:24,maxtemp_c:35,daily_chance_of_rain:60}}]}};
test('tempo: Palmas padrão, seleção validada, cache compartilhado e chave privada',async()=>{
 let calls=0;const app=express();mountWeather(app,{key:'private-test-key',now:()=>now,fetcher:async url=>{calls++;assert.equal(url.hostname,'api.weatherapi.com');assert.equal(url.searchParams.get('lang'),'pt');return new Response(JSON.stringify(payload));}});
 const responses=await Promise.all([request(app).get('/api/tempo'),request(app).get('/api/tempo?cidade=palmas')]);
 responses.forEach(r=>{assert.equal(r.status,200);assert.equal(r.body.name,'Palmas');assert.equal(r.body.temperature,32);assert.ok(!r.text.includes('private-test-key'));});assert.equal(calls,1);
 await request(app).get('/api/tempo?cidade=araguaina').expect(200);assert.equal(calls,2);
 await request(app).get('/api/tempo?cidade=https://127.0.0.1').expect(400);assert.equal(calls,2);
});
test('tempo: sem chave, falhas, dados antigos e respostas inválidas não fabricam previsão',async()=>{
 const app=express();mountWeather(app,{key:''});await request(app).get('/api/tempo').expect(503);
 let calls=0;const failing=express();mountWeather(failing,{key:'test',now:()=>now,fetcher:async()=>{calls++;throw Error('secret should not appear');}});
 const r=await request(failing).get('/api/tempo').expect(503);assert.ok(!r.text.includes('secret'));await request(failing).get('/api/tempo').expect(503);assert.equal(calls,1);
 assert.throws(()=>normalizeWeather({current:{}},weatherCities[0]));
 const stale=express();mountWeather(stale,{key:'test',now:()=>now+4*3600000,fetcher:async()=>new Response(JSON.stringify(payload))});await request(stale).get('/api/tempo').expect(503);
});
test('localização: coordenadas limitadas, aproximadas e fora da URL',async()=>{
 let query;const app=express();mountWeather(app,{key:'test',now:()=>now,fetcher:async url=>{query=url.searchParams.get('q');return new Response(JSON.stringify({...payload,location:{name:'Gurupi'}}));}});
 const result=await request(app).post('/api/tempo/localizacao').send({latitude:-11.72938,longitude:-49.06831}).expect(200);
 assert.equal(query,'-11.7,-49.1');assert.equal(result.body.name,'Gurupi');assert.equal(result.body.city,'location');assert.ok(!JSON.stringify(result.body).includes('-11.7'));
 for(const body of [{latitude:100,longitude:0},{latitude:'-11',longitude:0},{latitude:null,longitude:0},{latitude:0,longitude:181}])await request(app).post('/api/tempo/localizacao').send(body).expect(400);
});
test('localização: só pede ao clicar, recusa preserva cidade e escolha manual cancela retorno antigo',async()=>{
 const nodes=new Map(),handlers=new Map(),requests=[];let asked=0,success,denied;
 const node=()=>({textContent:'',hidden:false,disabled:false,addEventListener(type,fn){handlers.set(this.id+type,fn);}});
 for(const id of ['select','[data-weather-status]','[data-weather-data]','[data-weather-locate]','[data-weather-location-status]','[data-weather-condition]','[data-weather-temp]','[data-weather-range]','[data-weather-rain]','[data-weather-updated]']){const n=node();n.id=id;nodes.set(id,n);}
 const select=nodes.get('select');select.value='palmas';select.options=[{value:'palmas'}];
 const widget={querySelector:s=>nodes.get(s),setAttribute(){},removeAttribute(){}};
 runInNewContext(readFileSync(new URL('../public/weather.js',import.meta.url),'utf8'),{document:{querySelector:()=>widget},navigator:{geolocation:{getCurrentPosition(a,b){asked++;success=a;denied=b;}}},localStorage:{getItem(){return null;},setItem(){}},AbortController,Intl,Date,fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({temperature:25,minimum:22,maximum:32,rain:20,condition:'Nublado',name:'Palmas',updatedAt:new Date(now).toISOString()})};}});
 await new Promise(r=>setImmediate(r));assert.equal(asked,0);
 handlers.get('[data-weather-locate]click')();assert.equal(asked,1);denied({code:1});assert.equal(select.value,'palmas');assert.match(nodes.get('[data-weather-location-status]').textContent,/não autorizada/);
 handlers.get('[data-weather-locate]click')();handlers.get('selectchange')();const before=requests.length;success({coords:{latitude:-11.72938,longitude:-49.06831}});assert.equal(requests.length,before);
 handlers.get('[data-weather-locate]click')();success({coords:{latitude:-11.72938,longitude:-49.06831}});await new Promise(r=>setImmediate(r));
 const last=requests.at(-1);assert.equal(last.url,'/api/tempo/localizacao');assert.equal(last.options.method,'POST');assert.equal(last.options.body,'{"latitude":-11.7,"longitude":-49.1}');
});
