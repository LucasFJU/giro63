if(process.env.VERCEL_ENV!=='production'||process.env.VERCEL_GIT_COMMIT_REF!=='main'){console.log('Publicação editorial pontual: somente produção/main.');process.exit(0);}
import {openPostgres,transaction} from '../src/postgres.js';
import {cloudMedia} from '../src/cloud-media.js';
import {readSuggestedImage,creditedImageEligible} from '../src/article-images.js';
import {reservePublication,event} from '../src/automation.js';
import {sourceFooter,contentHash} from '../src/publication-policy.js';
import {dayInSaoPaulo} from '../src/reader-experience.js';
const edits={
66:[
'Um motorista morreu na manhã desta segunda-feira (9), após uma colisão envolvendo três veículos na BR-153, em Gurupi, no sul do Tocantins. De acordo com a Polícia Rodoviária Federal (PRF), o acidente ocorreu no km 687.',
'Segundo a PRF, o carro atingiu a lateral esquerda de um caminhão, rodou na pista e bateu de frente em uma caminhonete. A Ecovias Araguaia, responsável pelo trecho, informou que os demais envolvidos não ficaram feridos.',
'A rodovia foi interditada temporariamente nos dois sentidos para o atendimento, a perícia e a remoção do corpo. Conforme as informações publicadas pelo G1 Tocantins, o tráfego foi liberado após a conclusão dos trabalhos.'
],
67:[
'A orientação nacional para organizar um kit de emergência tem caráter preventivo e não indica uma ameaça atual ao Tocantins. O esclarecimento foi divulgado pelo governo estadual após uma publicação da Defesa Civil Nacional repercutir nas redes sociais, segundo o G1 Tocantins.',
'A Defesa Civil do Tocantins informou que não há previsão de eventos graves ou situações de ameaça no estado. A recomendação busca incentivar as famílias a reunir, aos poucos, materiais para possíveis emergências. As orientações devem ser acompanhadas nos canais oficiais estaduais e municipais.',
'O kit é pensado para as primeiras 72 horas em caso de desastre. A lista divulgada inclui água potável, alimentos não perecíveis, utensílios, produtos de higiene, itens de primeiros socorros, roupas, documentos, lanternas, pilhas e carregadores.',
'Também devem ser consideradas as necessidades de crianças, bebês e animais domésticos. A campanha recomenda conferir a validade dos itens a cada seis meses.'
],
68:[
'A Polícia Civil procura um homem de 35 anos suspeito de atingir com uma caminhonete a moto em que estavam a ex-companheira dele e duas familiares, em Campos Lindos, no norte do Tocantins. Diana Vieira dos Santos, de 28 anos, e Laila Vieira dos Santos, de 7, morreram no local.',
'Segundo a Secretaria da Segurança Pública (SSP), a ex-companheira, de 38 anos, conduzia a motocicleta e ficou gravemente ferida. Ela foi encaminhada ao Hospital Regional de Araguaína, onde permanecia internada na atualização publicada pelo G1 Tocantins.',
'De acordo com a investigação, o suspeito não aceitava o fim do relacionamento. As vítimas retornavam de um balneário no sábado (7) quando foram atingidas, e o homem fugiu. A SSP informou que ele teria ameaçado a ex-companheira na véspera. A sobrevivente havia mantido uma união estável com o suspeito durante 20 anos.',
'A SSP classificou o caso como feminicídio. A investigação é conduzida pela 36ª Delegacia de Polícia de Campos Lindos. Os corpos foram encaminhados ao Núcleo de Medicina Legal de Araguaína e depois liberados aos familiares. O nome do suspeito não foi informado; segundo o G1, não foi possível contatar sua defesa.'
],
69:[
'Um homem de 36 anos morreu após ser esfaqueado durante um desentendimento entre vizinhos no setor Nova Cidade, em Dianópolis, no sul do Tocantins. A vítima foi identificada como Anderson Lopez da Cruz. Segundo a Polícia Militar, ele tentou fugir depois de ser atingido, mas caiu na rua e morreu.',
'A ocorrência foi registrada na noite de sábado (7), por volta das 22h23. Conforme a polícia, um homem de 34 anos e uma mulher de 36 anos também se envolveram na situação, ficaram feridos e receberam atendimento médico.',
'O suspeito, de 45 anos, foi preso em flagrante e encaminhado à delegacia. A faca usada na ocorrência foi apreendida pela Polícia Científica. O corpo da vítima foi levado ao Instituto Médico Legal de Gurupi para exames.',
'O nome do suspeito não foi divulgado e, segundo o G1 Tocantins, não foi possível contatar sua defesa. O portal informou ainda que havia solicitado esclarecimentos à Secretaria de Segurança Pública, sem resposta até aquela atualização.'
]};
const db=openPostgres(process.env.DATABASE_URL),media=cloudMedia();
try{for(const id of [66,67,68,69]){
 const a=await db.prepare('SELECT * FROM articles WHERE id=?').get(id);const item=await db.prepare('SELECT i.*,s.region,s.approved FROM automation_items i JOIN automation_sources s ON s.id=i.source_id WHERE i.article_id=?').get(id);
 if(a?.status!=='review'||JSON.parse(item?.blockers||'[]').some(c=>!['ATTRIBUTION_LOST','IMAGE_PENDING'].includes(c))||!item?.approved||dayInSaoPaulo(Date.parse(item.original_at))!==dayInSaoPaulo()){console.log('Ignorada por estado/data/fonte: '+id);continue;}
 const image=await db.prepare("SELECT * FROM article_image_suggestions WHERE article_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1").get(id);
 if(!image||!creditedImageEligible(image)){console.log('Imagem bloqueada: '+id);continue;}
 const cover=await media.save({buffer:await readSuggestedImage(image)});const now=new Date().toISOString(),body=edits[id].map(p=>'<p>'+p+'</p>').join('')+sourceFooter('G1 Tocantins',item.url);
 await transaction(db,async()=>{
 await db.prepare('SELECT pg_advisory_xact_lock(6363)').get();const current=await db.prepare('SELECT * FROM articles WHERE id=? FOR UPDATE').get(id);
 if(current.status!=='review'||current.updated_at!==a.updated_at)throw Error('Matéria alterada; interrompido para preservar edição.');
 if(!await reservePublication(db,item.region==='regional'))throw Error('Cota diária atingida.');
 await db.prepare("UPDATE articles SET body=?,cover=?,cover_alt=?,credit=?,photo_photographer=?,photo_source=?,photo_source_url=?,photo_license='',photo_caption=?,status='published',published_at=?,updated_at=? WHERE id=?").run(body,cover,image.alt,image.photographer+' / G1 Tocantins',image.photographer,'G1 Tocantins',image.source_page,image.caption,now,now,id);
 const hash=contentHash({...a,body});
 await db.prepare("UPDATE automation_items SET state='published',blockers='[]',review_reasons=?,review_pending=1,approved_cover=?,publication_counted=1,confirmed_hash=?,resolution_note=?,note=?,updated_at=? WHERE id=?").run(JSON.stringify(['PHOTO_REVIEW','SENSITIVE']),cover,hash,'Comparação assistida com o RSS de origem, sem apuração independente. Texto ajustado para preservar atribuições e remover acréscimos não sustentados. Publicação solicitada pela redação; foto creditada com conferência posterior.','Publicado — conferir fotografia e edição.',now,item.id);
 await event(db,'Publicação solicitada pela redação: artigo '+id+'; conferência de foto pendente; revisão do texto registrada.');
 });console.log('Publicada com conferência pendente: '+id);
}}catch{console.error('Operação interrompida; consultar contadores e estados antes de retomar.');process.exitCode=1;}finally{await db.close();}
