import sharp from 'sharp';
import {create} from 'fontkit';
import {readFileSync} from 'node:fs';
const root=new URL('../public/',import.meta.url),serif=create(readFileSync(new URL('fonts/source-serif-4-latin-600-normal.woff2',root))),sans=create(readFileSync(new URL('fonts/source-sans-3-latin-400-normal.woff2',root))),bold=create(readFileSync(new URL('fonts/source-sans-3-latin-700-normal.woff2',root)));
const logo=readFileSync(new URL('images/giro63-logo-branca.webp',root));
const width=(text,font,size)=>font.layout(text).glyphs.reduce((sum,g)=>sum+g.advanceWidth,0)*size/font.unitsPerEm;
function lines(text,font,size,maxWidth){const result=[];let line='';for(const word of String(text).replace(/\s+/g,' ').trim().split(' ')){if(width(word,font,size)>maxWidth)throw Error('Palavra muito longa para a arte. Ajuste o título social.');if(line&&width(line+' '+word,font,size)>maxWidth){result.push(line);line=word;}else line=line?line+' '+word:word;}if(line)result.push(line);return result;}
function paths(text,font,size,x,y,color){const run=font.layout(text),scale=size/font.unitsPerEm;let cursor=x,out='';for(let i=0;i<run.glyphs.length;i++){const p=run.positions[i];out+='<path fill="'+color+'" transform="translate('+(cursor+p.xOffset*scale)+' '+(y-p.yOffset*scale)+') scale('+scale+' '+(-scale)+')" d="'+run.glyphs[i].path.toSVG()+'"/>';cursor+=p.xAdvance*scale;}return out;}
export async function renderInstagramArt({image,headline,standfirst,category,credit,source,x=50,y=50,format='feed',site='giro63.vercel.app'}){
 const height=format==='story'?1920:format==='fallback'?1350:1440,margin=64,safeBottom=format==='story'?245:64;
 let titleLines,size;for(size=82;size>=54;size-=2){titleLines=lines(headline,serif,size,952);if(titleLines.length<=(format==='story'?7:6))break;}if(size<54)throw Error('Título longo para a arte. Ajuste o título social, preservando o sentido.');
 const summaryLines=lines(standfirst,sans,30,952);if(summaryLines.length>4)throw Error('Resumo longo para a arte. Ajuste o resumo social sem retirar informações essenciais.');
 const credits=lines([credit?'Foto: '+credit:'',source?'Fonte: '+source:''].filter(Boolean).join(' · '),sans,22,952);if(credits.length>3)throw Error('Crédito longo para a arte. Ajuste a identificação sem omitir a autoria.');
 const contentHeight=52+size+titleLines.length*size*1.13+20+summaryLines.length*40+20+34+credits.length*28+20+43;
 let top=height-safeBottom-contentHeight;if(top<(format==='story'?250:80))throw Error('Texto e créditos não cabem na arte. Reduza o texto social antes de continuar.');
 const original=await sharp(image,{limitInputPixels:25e6}).rotate().toBuffer({resolveWithObject:true}),scale=Math.max(1080/original.info.width,height/original.info.height),w=Math.ceil(original.info.width*scale),h=Math.ceil(original.info.height*scale);
 const photo=await sharp(original.data).resize(w,h).extract({left:Math.round((w-1080)*x/100),top:Math.round((h-height)*y/100),width:1080,height}).toBuffer();
 let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="'+height+'"><defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#102a43" stop-opacity="0"/><stop offset=".48" stop-color="#102a43" stop-opacity=".82"/><stop offset="1" stop-color="#071c2d"/></linearGradient></defs><rect y="'+Math.max(0,top-260)+'" width="1080" height="'+(height-Math.max(0,top-260))+'" fill="url(#shade)"/>';
 const label=String(category).toLocaleUpperCase('pt-BR'),labelWidth=width(label,bold,24)+30;if(labelWidth>952)throw Error('Nome da editoria longo para o selo.');
 svg+='<rect x="64" y="'+top+'" width="'+labelWidth+'" height="42" rx="3" fill="#ed521a"/>'+paths(label,bold,24,79,top+29,'white');let baseline=top+52+size;
 for(const line of titleLines){svg+=paths(line,serif,size,margin,baseline,'white');baseline+=size*1.13;}
 baseline+=20;for(const line of summaryLines){svg+=paths(line,sans,30,margin,baseline,'white');baseline+=40;}
 baseline+=20;svg+='<path stroke="#ffffff55" d="M64 '+baseline+' H1016"/>';baseline+=34;
 for(const line of credits){svg+=paths(line,sans,22,margin,baseline,'#dce8f2');baseline+=28;}
 const cta='Leia no Giro63 · '+site;if(width(cta,sans,24)>700)throw Error('Endereço público longo para a arte. Confira a configuração do portal.');svg+=paths(cta,sans,24,286,height-safeBottom-14,'white');
 svg+='</svg>';const logoBuffer=await sharp(logo).trim().resize({width:190}).png().toBuffer();
 return sharp(photo).composite([{input:Buffer.from(svg)},{input:logoBuffer,left:64,top:height-safeBottom-43}]).flatten({background:'#102a43'}).jpeg({quality:90,chromaSubsampling:'4:4:4'}).toBuffer();
}
