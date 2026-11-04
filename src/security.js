import session from 'express-session';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import sanitizeHtml from 'sanitize-html';

export class SQLiteSessionStore extends session.Store {
  constructor(db) { super(); this.db=db; }
  get(sid,cb) { try { const row=this.db.prepare('SELECT data FROM sessions WHERE sid=? AND expires>?').get(sid,Date.now()); cb(null,row ? JSON.parse(row.data):null); } catch(e) {cb(e);} }
  set(sid,data,cb=()=>{}) { try { this.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now()); this.db.prepare('INSERT OR REPLACE INTO sessions(sid,data,expires) VALUES(?,?,?)').run(sid,JSON.stringify(data),Date.now()+8*3600000); cb(); }catch(e){cb(e);} }
  destroy(sid,cb=()=>{}) { try{this.db.prepare('DELETE FROM sessions WHERE sid=?').run(sid);cb();}catch(e){cb(e);} }
  touch(sid,data,cb=()=>{}) { this.set(sid,data,cb); }
}
export function csrf(req,res,next) {
  if(!req.session.csrf) req.session.csrf=randomBytes(32).toString('hex');
  res.locals.csrf=req.session.csrf;
  next();
}
export function checkCsrf(req,res,next) {
  const expected=Buffer.from(req.session.csrf||''); const supplied=Buffer.from(String(req.body?._csrf||''));
  if(!expected.length||expected.length!==supplied.length||!timingSafeEqual(expected,supplied)) return res.status(403).render('error',{title:'Formulário expirado',message:'Atualize a página e tente novamente. Nenhuma alteração foi realizada.'});
  next();
}
export const cleanBody = value => sanitizeHtml(String(value||''), { allowedTags:['p','br','strong','b','em','i','u','h2','h3','ul','ol','li','blockquote','a'], allowedAttributes:{a:['href','title']}, allowedSchemes:['http','https'], allowProtocolRelative:false, transformTags:{a:sanitizeHtml.simpleTransform('a',{rel:'noopener noreferrer'})} });
export function safeUrl(value) { const s=String(value||'').trim(); if(!s)return ''; try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';} }
