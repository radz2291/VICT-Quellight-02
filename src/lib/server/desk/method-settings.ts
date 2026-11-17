import type {PostgresStoreSet} from '@victframework/store-postgres';
import {deskMethodSettingsBindings,type DeskMethodSettingsInput,type DeskMethodSettingsActionId,type DeskMethodSettingsSnapshot,type AppDeskMethodSettings,type RoomDeskMethodSettings} from '../../product/desk-contracts.js';
import {authorizedActor,ProductError,type Owner} from '../domain/queries.js';
import {executeMemoryMutation} from '../memory/governed.js';
import {deskDigest,ownedDeskRoom,type DeskSql} from './domain.js';
import catalog from '../prompts/desk-method.json';
const heads='quellight_product_v1.desk_method_settings',history='quellight_product_v1.desk_method_settings_history';
export async function lockMethodSettings(client:DeskSql,actorId:string){await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`quellight:desk-method-settings:${actorId}`]);}
const initial=(target:'app'|'room')=>target==='app'?{enabled:catalog.enabled,prompt:catalog.prompt}:{enabled:'inherit',prompt:{mode:'inherit',text:''}};
function closed(value:unknown,keys:string[]):Record<string,any>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new ProductError('DESK_METHOD_SETTINGS_INVALID');
 const result:Record<string,any>={},own=Object.getOwnPropertyDescriptors(value);if(Reflect.ownKeys(own).length!==keys.length)throw new ProductError('DESK_METHOD_SETTINGS_INVALID');
 for(const key of Reflect.ownKeys(own)){if(typeof key!=='string'||!keys.includes(key)||!own[key].enumerable||!('value'in own[key]))throw new ProductError('DESK_METHOD_SETTINGS_INVALID');result[key]=own[key].value;}return result;
}
export function methodSettingsContent(target:'app'|'room',raw:unknown):AppDeskMethodSettings|RoomDeskMethodSettings{
 const value=closed(raw,['enabled','prompt']);
 if(target==='app'){if(typeof value.enabled!=='boolean'||typeof value.prompt!=='string'||!value.prompt.trim())throw new ProductError('DESK_METHOD_SETTINGS_INVALID');return{enabled:value.enabled,prompt:value.prompt};}
 const prompt=closed(value.prompt,['mode','text']);if(!['inherit','enabled','disabled'].includes(value.enabled)||!['inherit','custom'].includes(prompt.mode)||typeof prompt.text!=='string'||prompt.mode==='custom'&&!prompt.text.trim())throw new ProductError('DESK_METHOD_SETTINGS_INVALID');
 return{enabled:value.enabled,prompt:{mode:prompt.mode,text:prompt.text}};
}
function snapshot(target:'app'|'room',roomId:string,row?:Record<string,any>):DeskMethodSettingsSnapshot{return{target,roomId,revision:row?.revision??0,content:methodSettingsContent(target,row?.content??initial(target)),operation:row?.operation??'initial',createdAt:row?new Date(row.created_at).toISOString():null};}
export async function readMethodSettings(client:DeskSql,actorId:string,target:'app'|'room',roomId=''){
 if(target!=='app'&&target!=='room'||target==='app'&&roomId!=='')throw new ProductError('DESK_METHOD_SETTINGS_INVALID');
 if(target==='room')await ownedDeskRoom(client,actorId,roomId);
 return snapshot(target,roomId,(await client.query(`SELECT * FROM ${heads} WHERE actor_id=$1 AND scope_key=$2`,[actorId,target==='app'?'app':roomId])).rows[0]);
}
export async function effectiveMethodSettings(client:DeskSql,actorId:string,roomId:string){
 const row=(await client.query(`SELECT to_jsonb(a) AS app,to_jsonb(s) AS room FROM quellight_product_v1.rooms r LEFT JOIN ${heads} a ON a.actor_id=r.actor_id AND a.scope_key='app' LEFT JOIN ${heads} s ON s.actor_id=r.actor_id AND s.scope_key=r.id::text WHERE r.id=$1 AND r.actor_id=$2`,[roomId,actorId])).rows[0];
 if(!row)throw new ProductError('ROOM_NOT_FOUND',404);const app=snapshot('app','',row.app),room=snapshot('room',roomId,row.room),a=app.content as AppDeskMethodSettings,r=room.content as RoomDeskMethodSettings;
 const resolved={enabled:r.enabled==='inherit'?a.enabled:r.enabled==='enabled',prompt:r.prompt.mode==='inherit'?a.prompt:r.prompt.text};
 return{...resolved,revision:deskDigest({catalog:catalog.revision,app,room}),appRevision:app.revision,roomRevision:room.revision};
}
export async function methodSettingsView(stores:PostgresStoreSet,owner:Owner,target:'app'|'room',roomId=''){
 await authorizedActor(stores,owner,'app.data.read');const current=await readMethodSettings(stores.coordination.pool,owner.actorId,target,roomId);
 const rows=(await stores.coordination.pool.query(`SELECT * FROM ${history} WHERE actor_id=$1 AND scope_key=$2 ORDER BY revision DESC`,[owner.actorId,target==='app'?'app':roomId])).rows;
 return{snapshot:current,history:rows.length?rows.map(r=>snapshot(target,roomId,r)):[current],...(target==='room'?{effective:await effectiveMethodSettings(stores.coordination.pool,owner.actorId,roomId)}:{})};
}
async function write(client:DeskSql,actorId:string,id:DeskMethodSettingsActionId,value:DeskMethodSettingsInput){
 await lockMethodSettings(client,actorId);
 const scope=value.target==='app'?'app':value.roomId;if(value.target==='room')await ownedDeskRoom(client,actorId,value.roomId,true);
 const seed=snapshot(value.target,value.roomId);const inserted=await client.query(`INSERT INTO ${heads}(actor_id,scope_key,room_id,revision,content,operation) VALUES($1,$2,$3,0,$4::jsonb,'initial') ON CONFLICT DO NOTHING RETURNING revision`,[actorId,scope,value.target==='room'?value.roomId:null,JSON.stringify(seed.content)]);
 const current=(await client.query(`SELECT * FROM ${heads} WHERE actor_id=$1 AND scope_key=$2 FOR UPDATE`,[actorId,scope])).rows[0];
 if(current.revision!==value.expectedRevision)throw new ProductError('DESK_METHOD_SETTINGS_CONFLICT',409);
 let content:unknown;if(id.endsWith('.save')){try{content=JSON.parse(value.content!);}catch{throw new ProductError('DESK_METHOD_SETTINGS_INVALID');}}else{const old=(await client.query(`SELECT content FROM ${history} WHERE actor_id=$1 AND scope_key=$2 AND revision=$3`,[actorId,scope,value.restoreRevision])).rows[0];if(!old)throw new ProductError('DESK_METHOD_SETTINGS_REVISION_NOT_FOUND',404);content=old.content;}
 content=methodSettingsContent(value.target,content);const operation=id.endsWith('.save')?'save':'restore';
 if(inserted.rows.length)await client.query(`INSERT INTO ${history}(actor_id,scope_key,revision,content,operation) VALUES($1,$2,0,$3::jsonb,'initial')`,[actorId,scope,JSON.stringify(seed.content)]);
 const saved=(await client.query(`UPDATE ${heads} SET revision=revision+1,content=$3::jsonb,operation=$4,created_at=now() WHERE actor_id=$1 AND scope_key=$2 RETURNING *`,[actorId,scope,JSON.stringify(content),operation])).rows[0];
 await client.query(`INSERT INTO ${history}(actor_id,scope_key,revision,content,operation) VALUES($1,$2,$3,$4::jsonb,$5)`,[actorId,scope,saved.revision,JSON.stringify(content),operation]);return snapshot(value.target,value.roomId,saved);
}
export async function executeMethodSettingsAction(stores:PostgresStoreSet,owner:Owner,id:string,input:unknown,key:string){
 if(!Object.hasOwn(deskMethodSettingsBindings,id))throw new ProductError('ACTION_UNDECLARED');const binding=deskMethodSettingsBindings[id as DeskMethodSettingsActionId];
 return executeMemoryMutation(stores,owner,binding,input,key,(client,value)=>write(client,owner.actorId,binding.id,value));
}
