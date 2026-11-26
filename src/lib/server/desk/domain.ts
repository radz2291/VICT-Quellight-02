import { createHash, randomUUID } from 'node:crypto';
import type { PostgresStoreSet } from '@victframework/store-postgres';
import { deskActionBindings, type DeskActionId, type DeskActionInput, type DeskItem, type DeskHistoryEntry, type DeskAuthorKind } from '../../product/desk-contracts.js';
import type { DeskSummary, DeskRevisionPage } from '../../product/desk-client.js';
import { authorizedActor, ProductError, type Owner } from '../domain/queries.js';
import { executeMemoryMutation } from '../memory/governed.js';
import type { MemorySettingsSqlClient } from '../memory/settings.js';

export type DeskSql = MemorySettingsSqlClient;
export const deskDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const table='quellight_product_v1.desk_items';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export interface DeskProvenance { authorKind:DeskAuthorKind; commandKey:string; turnId?:string; conversationId?:string; invocationId?:string;
  authorityRevision?:string; sourceMessageIds?:readonly string[]; jobId?:string }
function deskSummary(row:Record<string,any>):DeskSummary {return {id:row.id,roomId:row.room_id,title:row.title,kind:row.kind,status:row.status,
  attention:row.attention,archivedAt:row.archived_at?new Date(row.archived_at).toISOString():null,revision:row.revision,isMethod:row.is_method,
  createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString()};}
export function deskItem(row:Record<string,any>):DeskItem { return { ...deskSummary(row), body: row.body }; }
export async function ownedDeskRoom(client:DeskSql,actorId:string,roomId:string,write=false) {
  if(!uuid.test(roomId))throw new ProductError('ROOM_NOT_FOUND',404);
  const row=(await client.query(`SELECT id,archived_at FROM quellight_product_v1.rooms WHERE id=$1 AND actor_id=$2${write?' FOR UPDATE':''}`,[roomId,actorId])).rows[0];
  if(!row)throw new ProductError('ROOM_NOT_FOUND',404);
  if(write&&row.archived_at)throw new ProductError('ROOM_ARCHIVED',409);
  return row;
}
export interface DeskListOptions { query?:string; archived?:boolean; attention?:'carried'|'within-reach'|'put-away'; cursor?:string; pageSize?:number; model?:boolean; authorityRevision?:string }
async function selectDeskPage(stores:PostgresStoreSet,owner:Owner,roomId:string,options:DeskListOptions,summary: boolean) {
  await authorizedActor(stores,owner,'app.data.read');await ownedDeskRoom(stores.coordination.pool,owner.actorId,roomId);
  const size=options.pageSize??50;
  if(!Number.isSafeInteger(size)||size<1||size>200||options.query!==undefined&&typeof options.query!=='string'||options.attention&&!['carried','within-reach','put-away'].includes(options.attention))throw new ProductError('DESK_QUERY_INVALID');
  const args:unknown[]=[owner.actorId,roomId]; const where=['actor_id=$1','room_id=$2',options.archived?'archived_at IS NOT NULL':'archived_at IS NULL'];
  if(options.attention){args.push(options.attention);where.push(`attention=$${args.length}`);}
  if(options.model&&!options.query)where.push("attention<>'put-away'");
  if(options.model){args.push(options.authorityRevision??'');where.push(`(derivation_authority_revision IS NULL OR derivation_authority_revision=$${args.length})`);}
  if(options.query){args.push(options.query.toLowerCase());where.push(`strpos(lower(title||E'\\n'||body||E'\\n'||kind||E'\\n'||status),$${args.length})>0`);}
  if(options.cursor){let cursor:unknown;try{cursor=JSON.parse(Buffer.from(options.cursor,'base64url').toString());}catch{throw new ProductError('DESK_QUERY_INVALID');}
    if(!Array.isArray(cursor)||cursor.length!==2||typeof cursor[0]!=='string'||!Number.isFinite(Date.parse(cursor[0]))||!uuid.test(cursor[1]))throw new ProductError('DESK_QUERY_INVALID');
    args.push(cursor[0],cursor[1]);where.push(`(updated_at,id)<($${args.length-1}::timestamptz,$${args.length}::uuid)`);}
  const columns = 'id, room_id, title, kind, status, attention, archived_at, revision, is_method, created_at, updated_at';
  args.push(size+1);const rows=(await stores.coordination.pool.query(`SELECT ${columns}${summary ? '' : ', body'},updated_at::text AS cursor_time FROM ${table} WHERE ${where.join(' AND ')} ORDER BY updated_at DESC,id DESC LIMIT $${args.length}`,args)).rows;
  const page=rows.slice(0,size),last=page.at(-1);
  return {rows:page,nextCursor:rows.length>size&&last?Buffer.from(JSON.stringify([last.cursor_time,last.id])).toString('base64url'):null};
}
export async function listDesk(stores:PostgresStoreSet,owner:Owner,roomId:string,options:DeskListOptions={}) {
  const { rows, nextCursor } = await selectDeskPage(stores, owner, roomId, options, false);
  return { items: rows.map(deskItem), nextCursor };
}
export async function listDeskSummaries(stores: PostgresStoreSet, owner: Owner, roomId: string, options: DeskListOptions = {}) {
  const { rows, nextCursor } = await selectDeskPage(stores, owner, roomId, options, true);
  return { items: rows.map(deskSummary), nextCursor };
}
async function readDeskItem(stores:PostgresStoreSet,owner:Owner,roomId:string,itemId:string,modelAuthority?:string) {
  await authorizedActor(stores,owner,'app.data.read');await ownedDeskRoom(stores.coordination.pool,owner.actorId,roomId);
  if(!uuid.test(itemId))throw new ProductError('DESK_NOT_FOUND',404);
  const row=(await stores.coordination.pool.query(`SELECT * FROM ${table} WHERE id=$1 AND actor_id=$2 AND room_id=$3`,[itemId,owner.actorId,roomId])).rows[0];
  if(!row||modelAuthority!==undefined&&(row.archived_at||row.derivation_authority_revision!==null&&row.derivation_authority_revision!==modelAuthority))throw new ProductError('DESK_NOT_FOUND',404);
  return deskItem(row);
}
const revisionTable = 'quellight_product_v1.desk_revisions';
const revisionOwner = 'item_id=$1 AND actor_id=$2 AND room_id=$3';
function revisionSummary(row: Record<string, any>) {
  return { revision: row.revision, authorKind: row.author_kind, operation: row.operation, createdAt: new Date(row.created_at).toISOString() };
}
function revisionDetail(row: Record<string, any>): DeskHistoryEntry { return { ...row.snapshot, ...revisionSummary(row) }; }
export async function getDeskItem(stores: PostgresStoreSet, owner: Owner, roomId: string, itemId: string, modelAuthority?: string) {
  const item = await readDeskItem(stores, owner, roomId, itemId, modelAuthority);
  const { rows } = await stores.coordination.pool.query(`SELECT snapshot,revision,author_kind,operation,created_at FROM ${revisionTable} WHERE ${revisionOwner} ORDER BY revision DESC`, [itemId, owner.actorId, roomId]);
  return { item, history: rows.map(revisionDetail) };
}
export async function getDeskCurrent(stores: PostgresStoreSet, owner: Owner, roomId: string, itemId: string) {
  return { item: await readDeskItem(stores, owner, roomId, itemId) };
}
export async function getDeskRevisionPage(stores: PostgresStoreSet, owner: Owner, roomId: string, itemId: string, beforeRevision?: number): Promise<DeskRevisionPage> {
  await authorizedActor(stores, owner, 'app.data.read');
  await ownedDeskRoom(stores.coordination.pool, owner.actorId, roomId);
  if (!uuid.test(itemId)) throw new ProductError('DESK_NOT_FOUND', 404);
  const pageSize = 30;
  const { rows } = await stores.coordination.pool.query(`SELECT revision,author_kind,operation,created_at FROM ${revisionTable}
    WHERE ${revisionOwner} AND ($4::integer IS NULL OR revision<$4) ORDER BY revision DESC LIMIT $5`,
  [itemId, owner.actorId, roomId, beforeRevision ?? null, pageSize + 1]);
  if (!rows.length) {
    const found = (await stores.coordination.pool.query(`SELECT 1 FROM ${table} WHERE id=$1 AND actor_id=$2 AND room_id=$3`, [itemId, owner.actorId, roomId])).rows[0];
    if (!found) throw new ProductError('DESK_NOT_FOUND', 404);
  }
  const history = rows.slice(0, pageSize).map(revisionSummary);
  return { history, nextRevision: rows.length > pageSize ? history.at(-1)!.revision : null };
}
export async function getDeskRevision(stores: PostgresStoreSet, owner: Owner, roomId: string, itemId: string, revision: number) {
  await authorizedActor(stores, owner, 'app.data.read');
  await ownedDeskRoom(stores.coordination.pool, owner.actorId, roomId);
  if (!uuid.test(itemId)) throw new ProductError('DESK_NOT_FOUND', 404);
  const { rows: [row] } = await stores.coordination.pool.query(`SELECT snapshot,revision,author_kind,operation,created_at FROM ${revisionTable}
    WHERE ${revisionOwner} AND revision=$4`, [itemId, owner.actorId, roomId, revision]);
  if (!row) throw new ProductError('DESK_NOT_FOUND', 404);
  return { revision: revisionDetail(row) };
}
export const searchDesk=(stores:PostgresStoreSet,owner:Owner,roomId:string,query:string,options:DeskListOptions={})=>{
  if(!query.trim())throw new ProductError('DESK_QUERY_INVALID');return listDesk(stores,owner,roomId,{...options,query});
};

/** Call only inside a declared VICT write's fenced transaction. Actor is checked by the public wrapper. */
export async function mutateDesk(client:DeskSql,actorId:string,id:DeskActionId,input:DeskActionInput,provenance:DeskProvenance) {
  await ownedDeskRoom(client,actorId,input.roomId,true);
  const {invocationId:_invocation,...identity}=provenance;
  const argumentDigest=deskDigest({id,input,provenance:identity});
  const prior=(await client.query('SELECT argument_digest,result FROM quellight_product_v1.desk_commands WHERE actor_id=$1 AND command_key=$2',[actorId,provenance.commandKey])).rows[0];
  if(prior){if(prior.argument_digest!==argumentDigest)throw new ProductError('ACTION_CONFLICT',409);return prior.result as {item:DeskItem};}
  const current=id==='desk.create'?undefined:(await client.query(`SELECT * FROM ${table} WHERE id=$1 AND actor_id=$2 AND room_id=$3 FOR UPDATE`,[input.itemId,actorId,input.roomId])).rows[0];
  if(id!=='desk.create'&&!current)throw new ProductError('DESK_NOT_FOUND',404);
  if(current&&current.revision!==input.expectedRevision)throw new ProductError('DESK_REVISION_CONFLICT',409);
  if(current?.archived_at&&id!=='desk.restore')throw new ProductError('DESK_ARCHIVED',409);
  if(current?.is_method&&provenance.authorKind==='agent')throw new ProductError('DESK_METHOD_RESERVED',403);
  if(provenance.authorKind==='agent'&&(!provenance.authorityRevision||current?.derivation_authority_revision&&current.derivation_authority_revision!==provenance.authorityRevision))throw new ProductError('DESK_SOURCE_CHANGED',409);
  const next:Record<string,any>={...(current??{id:randomUUID(),actor_id:actorId,room_id:input.roomId,archived_at:null,is_method:false,derivation_authority_revision:null}),revision:(current?.revision??0)+1};
  if(id==='desk.create'||id==='desk.save')Object.assign(next,{title:input.title!,body:input.body!,kind:input.kind!,status:input.status!,attention:input.attention!});
  if(id==='desk.edit'){
    const start=current!.body.indexOf(input.search!);if(start<0||current!.body.indexOf(input.search!,start+1)!==-1)throw new ProductError('DESK_EDIT_NOT_UNIQUE',409);
    next.body=current!.body.slice(0,start)+input.replacement!+current!.body.slice(start+input.search!.length);
  }
  if(id==='desk.append')next.body=current!.body+input.text!;
  if(id==='desk.archive')next.archived_at=new Date();
  if(id==='desk.restore'){if(!current!.archived_at)throw new ProductError('DESK_NOT_ARCHIVED',409);next.archived_at=null;}
  if(id==='desk.restore-version'){
    const revision=(await client.query('SELECT snapshot,provenance FROM quellight_product_v1.desk_revisions WHERE item_id=$1 AND actor_id=$2 AND revision=$3',[input.itemId,actorId,input.restoreRevision])).rows[0];
    if(!revision)throw new ProductError('DESK_REVISION_NOT_FOUND',404);
    const derived=revision.provenance.derivationAuthorityRevision??null;
    if(provenance.authorKind==='agent'&&derived!==null&&derived!==provenance.authorityRevision)throw new ProductError('DESK_SOURCE_CHANGED',409);
    for(const field of ['title','body','kind','status','attention'])next[field]=revision.snapshot[field];
    next.derivation_authority_revision=provenance.authorKind==='owner'?null:derived;
  }
  if(provenance.authorKind==='agent'&&(next.attention==='carried'&&!current||current&&next.attention!==current.attention&&(next.attention==='carried'||current.attention==='carried')))throw new ProductError('DESK_CARRIED_OWNER_ONLY',403);
  if(provenance.authorKind==='agent'){
    if(!provenance.authorityRevision)throw new ProductError('DESK_SOURCE_AUTHORITY_REQUIRED',403);
    if(['desk.create','desk.save','desk.edit','desk.append','desk.restore-version'].includes(id))next.derivation_authority_revision=provenance.authorityRevision;
  }
  // Only owner-created or deliberately rewritten text releases source dependency.
  // Metadata controls submit a full save too; unchanged text must not revive an old source.
  if(provenance.authorKind==='owner'&&(id==='desk.create'||id==='desk.save'&&input.body!==current!.body))next.derivation_authority_revision=null;
  if(provenance.authorKind==='method'){
    if(!provenance.authorityRevision||current&&!current.is_method)throw new ProductError('DESK_METHOD_RESERVED',403);
    next.is_method=true;next.attention=current?.attention??'carried';next.derivation_authority_revision=provenance.authorityRevision;
  }
  const saved=(await client.query(`INSERT INTO ${table}(id,actor_id,room_id,title,body,kind,status,attention,archived_at,revision,is_method,derivation_authority_revision)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,body=EXCLUDED.body,kind=EXCLUDED.kind,status=EXCLUDED.status,
    attention=EXCLUDED.attention,archived_at=EXCLUDED.archived_at,revision=EXCLUDED.revision,derivation_authority_revision=EXCLUDED.derivation_authority_revision,updated_at=now() RETURNING *`,
    [next.id,actorId,input.roomId,next.title,next.body,next.kind,next.status,next.attention,next.archived_at,next.revision,next.is_method,next.derivation_authority_revision])).rows[0];
  const item=deskItem(saved);await client.query(`INSERT INTO quellight_product_v1.desk_revisions(item_id,actor_id,room_id,revision,snapshot,author_kind,operation,provenance) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb)`,
    [item.id,actorId,input.roomId,item.revision,JSON.stringify(item),provenance.authorKind,id,JSON.stringify({...provenance,derivationAuthorityRevision:next.derivation_authority_revision})]);
  const result={item};await client.query('INSERT INTO quellight_product_v1.desk_commands(actor_id,command_key,argument_digest,result) VALUES($1,$2,$3,$4::jsonb)',[actorId,provenance.commandKey,argumentDigest,JSON.stringify(result)]);
  return result;
}
export async function executeDeskAction(stores:PostgresStoreSet,owner:Owner,actionId:string,input:unknown,commandKey:string) {
  if(!Object.hasOwn(deskActionBindings,actionId))throw new ProductError('ACTION_UNDECLARED');
  const binding=deskActionBindings[actionId as DeskActionId];
  return executeMemoryMutation(stores,owner,binding,input,commandKey,(client,value)=>mutateDesk(client,owner.actorId,binding.id,value,{authorKind:'owner',commandKey}));
}
