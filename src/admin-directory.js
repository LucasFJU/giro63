export function directoryData(rows,query={}){
 const q=String(query.q||'').trim().slice(0,100),normalize=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),filtered=rows.filter(r=>normalize(r.name).includes(normalize(q))),pages=Math.max(1,Math.ceil(filtered.length/15)),page=Math.min(pages,Math.max(1,parseInt(query.page)||1)),edit=String(query.edit||'');
 return {items:filtered.slice((page-1)*15,page*15),allItems:rows,q,edit,page,pages,total:filtered.length,directoryLink:(n=page,slug='')=>'?'+new URLSearchParams({q,page:String(n),...(slug?{edit:slug}:{})})};
}
