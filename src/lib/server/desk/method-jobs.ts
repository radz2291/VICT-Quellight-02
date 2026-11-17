import {randomUUID} from 'node:crypto';
import type {PostgresStoreSet} from '@victframework/store-postgres';
import type {DeskMethodGenerationResult} from '../desk-method-execution.js';
import {authorizedActor,ProductError,type Owner} from '../domain/queries.js';
import {deskItem,ownedDeskRoom,type DeskSql} from './domain.js';
import {validateDeliveryActor} from '../memory/jobs.js';
export const methodJobsTable='quellight_product_v1.desk_method_jobs';
export type MethodJobState='queued'|'running'|'retryable'|'completed'|'superseded'|'blocked';
export interface MethodPins {schema:'quellight.desk-method-pins@1';authorityRevision:string;sourceRevision:string;sourceMessageIds:string[];
 settingsRevision:string;deskRevision:string;methodId:string|null;methodRevision:number;instructions:string;input:string;revision:string}
export interface MethodJob {id:string;actor_id:string;room_id:string;conversation_id:string;turn_id:string;create_invocation_ids:string[];state:MethodJobState;
 attempts:number;claim_token:string|null;claim_expires:Date|null;pinned:MethodPins|null;attempt_id:string|null;prepared:DeskMethodGenerationResult|null;
 published_item_id:string|null;published_revision:number|null;publish_run_id:string|null;failure_code:string|null;created_at:Date;updated_at:Date}
export interface MethodJobOutcome {state:'retryable'|'completed'|'superseded'|'blocked';code?:string}
export async function methodEvent(client:DeskSql,jobId:string,stage:string,code:string|null=null,detail:unknown=null){
 await client.query('INSERT INTO quellight_product_v1.desk_method_events(job_id,stage,code,detail) VALUES($1,$2,$3,$4::jsonb)',[jobId,stage,code,detail===null?null:JSON.stringify(detail)]);
}
/** The host supplies completed actual invocation IDs captured before its settlement transaction. */
export async function enqueueMethodOccurrence(client:DeskSql,input:{actorId:string;roomId:string;conversationId:string;turnId:string;completedCreateInvocationIds:readonly string[]}){
 await ownedDeskRoom(client,input.actorId,input.roomId);
 const turn=(await client.query(`SELECT t.turn_id FROM quellight_product_v1.conversation_turns t JOIN quellight_product_v1.conversations c ON c.id=t.conversation_id AND c.actor_id=t.actor_id
  WHERE t.actor_id=$1 AND t.turn_id=$2 AND t.conversation_id=$3 AND c.room_id=$4 AND t.execution_state='settled' AND t.error_code IS NULL`,[input.actorId,input.turnId,input.conversationId,input.roomId])).rows[0];
 if(!turn||!input.completedCreateInvocationIds.length)return null;
 const receipts=(await client.query(`SELECT provenance->>'invocationId' AS id FROM quellight_product_v1.desk_revisions WHERE actor_id=$1 AND room_id=$2 AND author_kind='agent' AND operation='desk.create'
  AND provenance->>'turnId'=$3 AND provenance->>'invocationId'=ANY($4::text[]) ORDER BY item_id,revision`,[input.actorId,input.roomId,input.turnId,[...input.completedCreateInvocationIds]])).rows;
 const ids=[...new Set(receipts.map(r=>r.id as string))].sort();if(!ids.length)return null;
 const id=randomUUID(),inserted=await client.query(`INSERT INTO ${methodJobsTable}(id,actor_id,room_id,conversation_id,turn_id,create_invocation_ids) VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(actor_id,turn_id) DO NOTHING RETURNING *`,[id,input.actorId,input.roomId,input.conversationId,input.turnId,JSON.stringify(ids)]);
 if(inserted.rows[0]){await methodEvent(client,id,'queued');return inserted.rows[0] as MethodJob;}
 return(await client.query(`SELECT * FROM ${methodJobsTable} WHERE actor_id=$1 AND turn_id=$2`,[input.actorId,input.turnId])).rows[0] as MethodJob;
}
/** Claim under the dispatcher fence; expired delivery never erases generation or prepared publication. */
export async function claimMethodJob(client:DeskSql,deadline:Date,actorId?:string){
 const owner=validateDeliveryActor(actorId)??null;
 const expired=await client.query(`UPDATE ${methodJobsTable} SET state='retryable',claim_token=NULL,claim_expires=NULL,wake_after=now(),failure_code='HOST_INTERRUPTED',updated_at=now() WHERE state='running' AND claim_expires<=now() AND ($1::uuid IS NULL OR actor_id=$1::uuid) RETURNING id`,[owner]);
 for(const row of expired.rows)await methodEvent(client,row.id,'retryable','HOST_INTERRUPTED');
 const row=(await client.query(`UPDATE ${methodJobsTable} SET state='running',attempts=attempts+1,claim_token=$1,claim_expires=$2,updated_at=now() WHERE id=(SELECT j.id FROM ${methodJobsTable} j
  WHERE j.state IN('queued','retryable') AND j.wake_after<=now() AND ($3::uuid IS NULL OR j.actor_id=$3::uuid) AND NOT EXISTS(SELECT 1 FROM ${methodJobsTable} active WHERE active.actor_id=j.actor_id AND active.state='running' AND active.claim_expires>now()) ORDER BY j.wake_after,j.created_at,j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1) RETURNING *`,[randomUUID(),deadline,owner])).rows[0];
 if(!row)return null;await methodEvent(client,row.id,'running');return row as MethodJob;
}
export async function claimedMethodJob(client:DeskSql,job:MethodJob){
 const row=(await client.query(`SELECT * FROM ${methodJobsTable} WHERE id=$1 AND actor_id=$2 AND claim_token=$3 AND state='running' AND claim_expires>now() FOR UPDATE`,[job.id,job.actor_id,job.claim_token])).rows[0];
 if(!row)throw new ProductError('DESK_METHOD_CLAIM_LOST',409);return row as MethodJob;
}
export async function settleMethodJob(client:DeskSql,job:MethodJob,state:MethodJobOutcome['state'],code:string|null=null,retryAt=new Date()){
 const row=(await client.query(`UPDATE ${methodJobsTable} SET state=$3,claim_token=NULL,claim_expires=NULL,failure_code=$4,wake_after=$5,updated_at=now() WHERE id=$1 AND claim_token=$2 AND state='running' AND claim_expires>now() RETURNING id`,[job.id,job.claim_token,state,code,retryAt])).rows[0];
 if(!row)return false;await methodEvent(client,job.id,state,code);return true;
}
export async function methodView(stores:PostgresStoreSet,owner:Owner,roomId:string){
 await authorizedActor(stores,owner,'app.data.read');await ownedDeskRoom(stores.coordination.pool,owner.actorId,roomId);
 const item=(await stores.coordination.pool.query('SELECT * FROM quellight_product_v1.desk_items WHERE actor_id=$1 AND room_id=$2 AND is_method',[owner.actorId,roomId])).rows[0];
 const jobs=(await stores.coordination.pool.query(`SELECT * FROM ${methodJobsTable} WHERE actor_id=$1 AND room_id=$2 ORDER BY created_at DESC,id DESC`,[owner.actorId,roomId])).rows;
 const activity=(await stores.coordination.pool.query(`SELECT e.id::text,j.id AS "jobId",e.stage,e.code,e.at FROM quellight_product_v1.desk_method_events e JOIN ${methodJobsTable} j ON j.id=e.job_id WHERE j.actor_id=$1 AND j.room_id=$2 ORDER BY e.at DESC,e.id DESC`,[owner.actorId,roomId])).rows;
 const latest=jobs.find(j=>['running','queued','retryable','blocked'].includes(j.state))??jobs[0];
 return{item:item?deskItem(item):null,latestJob:latest?{id:latest.id,state:latest.state,stage:latest.published_item_id?'published':latest.prepared?'prepared':latest.attempt_id?'generation':'queued',code:latest.failure_code,createdAt:new Date(latest.created_at).toISOString(),updatedAt:new Date(latest.updated_at).toISOString()}:null,activity};
}
