import sharp from 'sharp';
import {create} from 'fontkit';
import {readFileSync} from 'node:fs';
const root=new URL('../public/',import.meta.url),serif=create(readFileSync(new URL('fonts/source-serif-4-latin-600-normal.woff2',root))),sans=create(readFileSync(new URL('fonts/source-sans-3-latin-400-normal.woff2',root))),bold=create(readFileSync(new URL('fonts/source-sans-3-latin-700-normal.woff2',root)));
const logo=readFileSync(new URL('images/giro63-logo-branca.webp',root));
const width=(text,font,size)=>font.layout(text).glyphs.reduce((sum,g)=>sum+g.advanceWidth,0)*size/font.unitsPerEm;
function lines(text,font,size,maxWidth){const result=[];let line='';for(const word of String(text).replace(/\s+/g,' ').trim().split(' ')){if(width(word,font,size)>maxWidth)throw Error('Palavra muito longa para a arte. Ajuste o título social.');if(line&&width(line+' '+word,font,size)>maxWidth){result.push(line);line=word;}else line=line?line+' '+word:word;}if(line)result.push(line);return result;}
function paths(text,font,size,x,y,color){const run=font.layout(text),scale=size/font.unitsPerEm;let cursor=x,out='';for(let i=0;i<run.glyphs.length;i++){const p=run.positions[i];out+='<path fill="'+color+'" transform="translate('+(cursor+p.xOffset*scale)+' '+(y-p.yOffset*scale)+') scale('+scale+' '+(-scale)+')" d="'+run.glyphs[i].path.toSVG()+'"/>';cursor+=p.xAdvance*scale;}return out;}
export async function renderInstagramArt(options){const template=options.template==='overlay'?'navy':options.template||'navy';if(!['navy','light'].includes(template))throw Error('Modelo inválido.');return renderEditorial({...options,x:options.x??50,y:options.y??50,format:options.format||'feed',site:options.site||'giro63.vercel.app',template});}
async function renderEditorial({image,headline,standfirst,category,x,y,format,site,template}){
 const height=format==='story'?1920:format==='fallback'?1350:1440,light=template==='light',bg=light?'#fbfaf7':'#102a43',ink=light?'#102a43':'#ffffff',footer=format==='story'?1680:height-78;
 const shift=format==='story'?50:0,titleTop=790+shift,maxWidth=920;let size,titleLines,summaryLines=lines(standfirst,sans,30,maxWidth);
 if(summaryLines.length>4)throw Error('Resumo longo para a arte. Ajuste o resumo social.');
 for(size=78;size>=48;size-=2){titleLines=lines(headline,serif,size,maxWidth);if(titleTop+size+titleLines.length*size*1.1+20+summaryLines.length*39+28<(format==='story'?1430:footer-36))break;}
 if(size<48)throw Error('Título e resumo não cabem na arte. Ajuste os textos sociais.');
 const original=await sharp(image,{limitInputPixels:25e6}).rotate().toBuffer({resolveWithObject:true}),scale=Math.max(1080/original.info.width,(900+shift)/original.info.height),w=Math.ceil(original.info.width*scale),h=Math.ceil(original.info.height*scale);
 const photo=await sharp(original.data).resize(w,h).extract({left:Math.round((w-1080)*x/100),top:Math.round((h-900-shift)*y/100),width:1080,height:900+shift}).toBuffer();
 let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="'+height+'"><defs><linearGradient id="panel" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+bg+'"/><stop offset="1" stop-color="'+(light?'#eee8dc':'#041e30')+'"/></linearGradient></defs><path d="M0 '+(625+shift)+' Q65 '+(570+shift)+' 180 '+(602+shift)+' L970 '+(739+shift)+' Q1080 '+(757+shift)+' 1080 '+(860+shift)+' V'+height+' H0 Z" fill="url(#panel)"/><path d="M0 '+(625+shift)+' Q65 '+(570+shift)+' 180 '+(602+shift)+' L970 '+(739+shift)+' Q1080 '+(757+shift)+' 1080 '+(860+shift)+'" fill="none" stroke="#ed521a" stroke-width="5"/><path d="M1080 1040 Q880 1110 910 1250 L1080 970" fill="'+(light?'#dce6ec':'#103c59')+'"/><path d="M820 '+height+' Q920 '+(height-60)+' 1080 '+(height-88)+' V'+height+' Z" fill="#ed521a"/>';
 const label=String(category).toLocaleUpperCase('pt-BR'),lw=width(label,bold,27)+48;if(lw>920)throw Error('Editoria longa para o selo.');
 svg+='<rect x="80" y="'+(710+shift)+'" width="'+lw+'" height="52" rx="26" fill="#ed521a"/>'+paths(label,bold,27,104,745+shift,'#fff');let baseline=titleTop+size;
 for(const line of titleLines){svg+=paths(line,serif,size,80,baseline,ink);baseline+=size*1.1;}
 baseline+=20;for(const line of summaryLines){svg+=paths(line,sans,30,80,baseline,ink);baseline+=39;}
 svg+='<rect x="80" y="'+(baseline+8)+'" width="130" height="6" rx="3" fill="#ed521a"/>';
 const cta='Leia no Giro63 | '+site;if(width(cta,sans,25)>660)throw Error('Endereço longo para a arte.');
 svg+='<path d="M326 '+(footer-40)+' V'+(footer+4)+'" stroke="#ed521a" stroke-width="3"/>'+paths(cta,sans,25,1000-width(cta,sans,25),footer-7,ink)+'</svg>';
 const brand=await sharp(light?readFileSync(new URL('images/giro63-logo-oficial.png',root)):logo).trim().resize({width:220,height:64,fit:'inside'}).png().toBuffer();
 return sharp({create:{width:1080,height,channels:3,background:bg}}).composite([{input:photo,left:0,top:0},{input:Buffer.from(svg)},{input:brand,left:80,top:footer-48}]).jpeg({quality:90,chromaSubsampling:'4:4:4'}).toBuffer();
}
