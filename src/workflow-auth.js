import {createRemoteJWKSet,jwtVerify} from 'jose';
import {createHash} from 'node:crypto';
const keys=createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));
export function validWorkflow(payload,workflow='editorial-automation.yml'){
  return payload.repository_id==='1445851477'&&payload.repository_owner_id==='53629446'&&payload.repository==='LucasFJU/giro63'&&payload.ref==='refs/heads/main'&&['editorial-automation.yml','instagram-publishing.yml'].includes(workflow)&&payload.workflow_ref==='LucasFJU/giro63/.github/workflows/'+workflow+'@refs/heads/main'&&['schedule','workflow_dispatch'].includes(payload.event_name)&&typeof payload.jti==='string';
}
export async function authorizeWorkflow(db,token,{workflow='editorial-automation.yml',audience='giro63-automation'}={}){
  if(token.length>16000)return false;
  try{
    const {payload}=await jwtVerify(token,keys,{issuer:'https://token.actions.githubusercontent.com',audience,algorithms:['RS256'],maxTokenAge:'10m'});
    if(!validWorkflow(payload,workflow))return false;
    await db.prepare("DELETE FROM automation_lock WHERE expires_at<? AND id<>'runner'").run(Date.now());
    const id='oidc:'+createHash('sha256').update(payload.jti).digest('hex');
    return (await db.prepare('INSERT INTO automation_lock(id,owner,expires_at) VALUES(?,?,?) ON CONFLICT DO NOTHING').run(id,'workflow',payload.exp*1000)).changes===1;
  }catch{return false;}
}
