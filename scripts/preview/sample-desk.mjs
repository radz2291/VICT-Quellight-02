import { randomUUID } from 'node:crypto';
// Labelled local UI data only. This module is never imported by a product route.
export const SAMPLE_DESK_ITEM = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
export const SAMPLE_PUT_AWAY_ITEM = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
export const SAMPLE_METHOD_ITEM = '88888888-8888-4888-8888-888888888888';
export function createSampleDesk({ rooms, receipts }) {
  const stamp=()=>new Date().toISOString(),copy=structuredClone;
  const ok=body=>({status:200,body:copy(body)}),fail=(status,code,message)=>({status,body:{ok:false,code,message}});
  const items=new Map(),history=new Map();
  function seed(id,title,body,attention,kind,status){const at=stamp(),item={id,roomId:rooms[0].id,title,body,attention,kind,status,revision:1,archivedAt:null,isMethod:false,createdAt:at,updatedAt:at};items.set(id,item);history.set(id,[{...copy(item),authorKind:'owner',operation:'create'}]);}
  seed(SAMPLE_DESK_ITEM,'A little room in the week','## Make space for one thing\n\nKeep Friday evening open.\n\n- A walk without headphones\n- A few pages of something good\n\nThere is no need to fill the space.','within-reach','Plan','Taking shape');
  seed(SAMPLE_PUT_AWAY_ITEM,'Someday, a small garden','A few herbs by the window. Start with mint.','put-away','Idea','For later');
  seed('99999999-9999-4999-8999-999999999999','What matters this month','Give the important things time, and let the rest wait.','carried','Note','');
  seed(SAMPLE_METHOD_ITEM,'How we work here','## A small, useful next step\n\nKeep plans short. Leave room for the owner’s own wording.\n\n*Sample method — local preview only.*','carried','Method','');items.get(SAMPLE_METHOD_ITEM).isMethod=true;
  const settings=new Map(),settingsHistory=new Map();
  const defaults=target=>target==='app'?{enabled:true,prompt:'Learn a short practical working method from eligible saved work. Preserve the owner’s edits.'}:{enabled:'inherit',prompt:{mode:'inherit',text:''}};
  function snapshot(target,roomId=''){const key=target==='app'?'app':roomId;if(!settings.has(key)){const value={target,roomId,revision:0,content:defaults(target),createdAt:null,operation:'initial'};settings.set(key,value);settingsHistory.set(key,[copy(value)]);}return settings.get(key);}
  return {handle(method,url,request){
    if(url.pathname==='/api/desk/method-settings'&&method==='GET'){
      const roomId=url.searchParams.get('roomId')??'',target=roomId?'room':'app',value=snapshot(target,roomId),app=snapshot('app'),effective=roomId?{enabled:value.content.enabled==='inherit'?app.content.enabled:value.content.enabled==='enabled',prompt:value.content.prompt.mode==='inherit'?app.content.prompt:value.content.prompt.text,revision:'synthetic',appRevision:app.revision,roomRevision:value.revision}:undefined;
      return ok({snapshot:value,history:[...settingsHistory.get(roomId||'app')].reverse(),...(effective?{effective}:{})});
    }
    const methodRoute=/^\/api\/rooms\/([^/]+)\/desk\/method$/.exec(url.pathname);
    if(methodRoute&&method==='GET')return ok({item:items.get(SAMPLE_METHOD_ITEM)?.roomId===methodRoute[1]?items.get(SAMPLE_METHOD_ITEM):null,latestJob:null,activity:[]});
    const route=/^\/api\/rooms\/([^/]+)\/desk(?:\/([^/]+))?$/.exec(url.pathname);
    if(route&&method==='GET'){
      const room=rooms.find(r=>r.id===route[1]);if(!room)return fail(404,'ROOM_NOT_FOUND','This room is unavailable.');
      const view=url.searchParams.get('view');
      if(route[2]){
        const item=items.get(route[2]);
        if(item?.roomId!==room.id)return fail(404,'DESK_ITEM_NOT_FOUND','This item is unavailable.');
        const versions=[...history.get(item.id)].reverse();
        if(view==='current')return ok({item});
        if(view==='history')return ok({history:versions.map(({revision,authorKind,operation,createdAt})=>({revision,authorKind,operation,createdAt})),nextRevision:null});
        if(view==='revision'){
          const revision=versions.find(entry=>entry.revision===Number(url.searchParams.get('revision')));
          return revision?ok({revision}):fail(404,'DESK_VERSION_NOT_FOUND','This version is unavailable.');
        }
        return ok({item,history:versions});
      }
      const query=(url.searchParams.get('query')??'').toLowerCase(),archived=url.searchParams.get('archived')==='true',attention=url.searchParams.get('attention');
      const all=[...items.values()].filter(i=>i.roomId===room.id&&!!i.archivedAt===archived&&(!attention||i.attention===attention)&&(!query||`${i.title} ${i.body} ${i.kind} ${i.status}`.toLowerCase().includes(query)));
      const offset=Number(url.searchParams.get('cursor')??0),page=all.slice(offset,offset+50);return ok({items:view==='summary'?page.map(({body,...item})=>item):page,nextCursor:offset+page.length<all.length?String(offset+page.length):null});
    }
    if(url.pathname!=='/api/actions'||method!=='POST'||!request?.actionId?.startsWith('desk.'))return null;
    const {actionId,input,idempotencyKey}=request,signature=JSON.stringify({actionId,input});const prior=receipts.get(idempotencyKey);
    if(prior)return prior.signature===signature?ok({...prior.result,replay:true}):fail(409,'ACTION_CONFLICT','That request key has another meaning.');
    if(actionId.startsWith('desk.method.settings.')){
      const current=snapshot(input.target,input.roomId),key=input.roomId||'app';if(current.revision!==input.expectedRevision)return fail(409,'DESK_METHOD_SETTINGS_CONFLICT','Method settings changed elsewhere.');
      let content;if(actionId.endsWith('.save'))content=JSON.parse(input.content);else content=settingsHistory.get(key).find(s=>s.revision===input.restoreRevision)?.content;
      if(!content)return fail(404,'DESK_METHOD_SETTINGS_REVISION_NOT_FOUND','This version is unavailable.');
      const value={...current,content:copy(content),revision:current.revision+1,createdAt:stamp(),operation:actionId.endsWith('.save')?'save':'restore'};settings.set(key,value);settingsHistory.get(key).push(copy(value));const result={ok:true,value,replay:false};receipts.set(idempotencyKey,{signature,result:copy(result)});return ok(result);
    }
    const room=rooms.find(r=>r.id===input.roomId);if(!room||room.archivedAt)return fail(409,'ROOM_UNAVAILABLE','Choose an active room.');
    let item=items.get(input.itemId);
    if(actionId!=='desk.create'&&(!item||item.roomId!==room.id))return fail(404,'DESK_ITEM_NOT_FOUND','This item is unavailable.');
    if(item&&item.revision!==input.expectedRevision)return fail(409,'DESK_REVISION_CONFLICT','This item changed elsewhere. Your draft is kept.');
    if(item?.archivedAt&&actionId!=='desk.restore')return fail(409,'DESK_ARCHIVED','Restore this item before editing it.');
    if(['desk.create','desk.save'].includes(actionId)){
      if(typeof input.title!=='string'||!input.title.trim()||input.title.length>200)return fail(400,'DESK_INPUT_INVALID','Give the item a title of up to 200 characters.');
      if(!item)item={id:randomUUID(),roomId:room.id,revision:0,archivedAt:null,isMethod:false,createdAt:stamp()};
      for(const key of ['title','body','kind','status','attention'])item[key]=input[key];
    }else if(actionId==='desk.archive')item.archivedAt=stamp();
    else if(actionId==='desk.restore')item.archivedAt=null;
    else if(actionId==='desk.restore-version'){const old=history.get(item.id)?.find(h=>h.revision===input.restoreRevision);if(!old)return fail(404,'DESK_VERSION_NOT_FOUND','This version is unavailable.');for(const key of ['title','body','kind','status','attention'])item[key]=old[key];}
    else if(actionId==='desk.append')item.body+=input.text;
    else return fail(403,'PREVIEW_ACTION_UNAVAILABLE','This sample action is unavailable.');
    item.revision++;item.updatedAt=stamp();items.set(item.id,item);history.set(item.id,[...(history.get(item.id)??[]),{...copy(item),authorKind:'owner',operation:actionId.replace('desk.','')}]);
    const result={ok:true,value:{item:copy(item)},replay:false};receipts.set(idempotencyKey,{signature,result:copy(result)});return ok(result);
  }};
}
