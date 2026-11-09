import {json} from 'express';
export const weatherCities=[
  ['palmas','Palmas',-10.184,-48.334],['araguaina','Araguaína',-7.192,-48.208],
  ['gurupi','Gurupi',-11.729,-49.068],['porto-nacional','Porto Nacional',-10.708,-48.414],
  ['paraiso-do-tocantins','Paraíso do Tocantins',-10.176,-48.883],['dianopolis','Dianópolis',-11.625,-46.82],
  ['tocantinopolis','Tocantinópolis',-6.325,-47.416],['mateiros','Mateiros (Jalapão)',-10.546,-46.417]
];
const finite=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
export function weatherLocation(body){
  if(!finite(body?.latitude,-90,90)||!finite(body?.longitude,-180,180))return null;
  const lat=Math.round(body.latitude*10)/10,lon=Math.round(body.longitude*10)/10;
  return ['geo:'+lat+','+lon,'Sua região',lat,lon];
}
export function normalizeWeather(data,city){
  const c=data.current,d=data.forecast?.forecastday?.[0];
  if(!finite(c?.temp_c,-60,65)||!finite(d?.day?.mintemp_c,-60,65)||!finite(d?.day?.maxtemp_c,-60,65)||!finite(d?.day?.daily_chance_of_rain,0,100)||!finite(c?.last_updated_epoch,1,1e11)||typeof c?.condition?.text!=='string')throw Error('Invalid weather');
  return {city:city[0],name:city[1],temperature:Math.round(c.temp_c),minimum:Math.round(d.day.mintemp_c),maximum:Math.round(d.day.maxtemp_c),rain:d.day.daily_chance_of_rain,condition:c.condition.text.slice(0,100),updatedAt:new Date(c.last_updated_epoch*1000).toISOString(),date:d.date,source:'WeatherAPI.com'};
}
export function mountWeather(app,{key=process.env.WEATHER_API_KEY,fetcher=fetch,now=Date.now}={}){
  const cache=new Map(),pending=new Map(),failures=new Map();
  async function load(city){
    for(const [id,entry] of cache)if(now()-entry.at>=30*60*1000)cache.delete(id);
    const cached=cache.get(city[0]);
    if(cached&&now()-cached.at<30*60*1000)return cached.value;
    if((failures.get(city[0])||0)>now())throw Error('Unavailable');
    if(pending.has(city[0]))return pending.get(city[0]);
    const request=(async()=>{
      try{
        const url=new URL('https://api.weatherapi.com/v1/forecast.json');
        for(const [k,v] of Object.entries({key,q:city[2]+','+city[3],days:'1',aqi:'no',alerts:'no',lang:'pt'}))url.searchParams.set(k,v);
        const response=await fetcher(url,{signal:AbortSignal.timeout(5000),redirect:'error'});
        if(!response.ok)throw Error('Unavailable');
        const text=await response.text();if(text.length>200000)throw Error('Oversized response');
        const parsed=JSON.parse(text),value=normalizeWeather(parsed,city);
        if(city[0].startsWith('geo:')){value.city='location';value.name=typeof parsed.location?.name==='string'?parsed.location.name.slice(0,100):'Sua região';}
        if(now()-Date.parse(value.updatedAt)>3*3600000||Date.parse(value.updatedAt)>now()+600000)throw Error('Stale weather');
        if(cache.size>=256)cache.delete(cache.keys().next().value);
        cache.set(city[0],{at:now(),value});failures.delete(city[0]);return value;
      }catch{if(failures.size>=256)failures.delete(failures.keys().next().value);failures.set(city[0],now()+60000);throw Error('Unavailable');}
      finally{pending.delete(city[0]);}
    })();pending.set(city[0],request);return request;
  }
  app.get('/api/tempo',async(req,res)=>{
    res.set('Cache-Control','no-store');
    const city=weatherCities.find(c=>c[0]===(req.query.cidade||'palmas'));
    if(!city)return res.status(400).json({message:'Escolha uma cidade disponível.'});
    if(!key)return res.status(503).json({message:'Previsão do tempo indisponível no momento.'});
    try{return res.json(await load(city));}catch{return res.status(503).json({message:'Previsão do tempo indisponível no momento.'});}
  });
  app.post('/api/tempo/localizacao',json({limit:'1kb'}),async(req,res)=>{
    res.set('Cache-Control','no-store');
    const city=weatherLocation(req.body);
    if(!city)return res.status(400).json({message:'Localização inválida.'});
    if(!key)return res.status(503).json({message:'Previsão do tempo indisponível no momento.'});
    try{return res.json(await load(city));}catch{return res.status(503).json({message:'Previsão do tempo indisponível no momento.'});}
  });
}
