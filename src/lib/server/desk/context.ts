import type { PostgresStoreSet } from '@victframework/store-postgres';
import { authorizedActor, ProductError, type Owner } from '../domain/queries.js';
import { deskDigest, ownedDeskRoom, type DeskSql } from './domain.js';
export interface DeskAuthorityReader { read():Promise<{revision:string}> }
/** Only actual completed body-read invocation IDs supplied by the trusted receipt reader qualify. */
export async function readDeskReads(stores:PostgresStoreSet,owner:Owner,roomId:string,turnId:string,completedReadInvocationIds:readonly string[],authority:DeskAuthorityReader){
 await authorizedActor(stores,owner,'app.data.read');await ownedDeskRoom(stores.coordination.pool,owner.actorId,roomId);
 const before=await authority.read();const rows=(await stores.coordination.pool.query(`SELECT invocation_id AS "invocationId",item_id AS "itemId",item_revision AS revision,title,at
  FROM quellight_product_v1.desk_reads WHERE actor_id=$1 AND room_id=$2 AND turn_id=$3 AND invocation_id=ANY($4::text[]) AND authority_revision=$5 ORDER BY at,invocation_id`,
  [owner.actorId,roomId,turnId,[...completedReadInvocationIds],before.revision])).rows;
 if((await authority.read()).revision!==before.revision)throw new ProductError('DESK_SOURCE_CHANGED',409);return rows;
}
export interface DeskContextSelection {
  schema:'quellight.desk-context@1';roomId:string;authorityRevision:string;
  items:readonly {id:string;revision:number;attention:'carried'|'within-reach';title:string;kind:string;status:string;body?:string}[];
  text:string;digest:string;
}
/** All eligible items are represented; paging is a UI transport choice, never a hidden context truncation. */
export async function prepareDeskContext(stores:PostgresStoreSet,owner:Owner,roomId:string,authority:DeskAuthorityReader):Promise<DeskContextSelection> {
  await authorizedActor(stores,owner,'app.data.read');await ownedDeskRoom(stores.coordination.pool,owner.actorId,roomId);
  const policy=await authority.read();
  const rows=(await stores.coordination.pool.query(`SELECT id,revision,attention,title,body,kind,status FROM quellight_product_v1.desk_items
    WHERE actor_id=$1 AND room_id=$2 AND archived_at IS NULL AND attention<>'put-away'
    AND (derivation_authority_revision IS NULL OR derivation_authority_revision=$3) ORDER BY id`,[owner.actorId,roomId,policy.revision])).rows;
  if((await authority.read()).revision!==policy.revision)throw new ProductError('DESK_SOURCE_CHANGED',409);
  const items=rows.map(row=>({id:row.id,revision:row.revision,attention:row.attention,title:row.title,kind:row.kind,status:row.status,
    ...(row.attention==='carried'?{body:row.body}:{})}));
  const text=JSON.stringify({carried:items.filter(x=>x.attention==='carried'),withinReach:items.filter(x=>x.attention==='within-reach')});
  const selected={schema:'quellight.desk-context@1' as const,roomId,authorityRevision:policy.revision,items,text};
  return {...selected,digest:deskDigest(selected)};
}
/** Caller owns the actual turn-admission transaction/fence. Does not dispatch or alter Desk records. */
export async function saveDeskContext(client:DeskSql,actorId:string,turnId:string,selection:DeskContextSelection) {
  const {digest,...value}=selection;if(deskDigest(value)!==digest)throw new ProductError('DESK_CONTEXT_INVALID');
  await ownedDeskRoom(client,actorId,selection.roomId);
  const prior=(await client.query('SELECT selection_digest FROM quellight_product_v1.desk_contexts WHERE actor_id=$1 AND turn_id=$2',[actorId,turnId])).rows[0];
  if(prior){if(prior.selection_digest!==digest)throw new ProductError('DESK_CONTEXT_CONFLICT',409);return;}
  await client.query('INSERT INTO quellight_product_v1.desk_contexts(actor_id,room_id,turn_id,selection_digest,selection) VALUES($1,$2,$3,$4,$5::jsonb)',[actorId,selection.roomId,turnId,digest,JSON.stringify(selection)]);
}
export async function readDeskContext(stores:PostgresStoreSet,owner:Owner,roomId:string,turnId:string,authority:DeskAuthorityReader) {
  await authorizedActor(stores,owner,'app.data.read');await ownedDeskRoom(stores.coordination.pool,owner.actorId,roomId);
  const policy=await authority.read();const row=(await stores.coordination.pool.query('SELECT selection FROM quellight_product_v1.desk_contexts WHERE actor_id=$1 AND room_id=$2 AND turn_id=$3',[owner.actorId,roomId,turnId])).rows[0];
  if((await authority.read()).revision!==policy.revision)throw new ProductError('DESK_SOURCE_CHANGED',409);
  return !row?{status:'unavailable' as const}:row.selection.authorityRevision!==policy.revision?{status:'invalidated' as const}:{status:'selected' as const,selection:row.selection as DeskContextSelection};
}
