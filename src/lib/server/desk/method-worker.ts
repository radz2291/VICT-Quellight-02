import {randomUUID} from 'node:crypto';
import {createRuntime} from '@victframework/runtime';
import {neutralJsonContract} from '@victframework/sdk';
import type {PostgresStoreSet} from '@victframework/store-postgres';
import type {DeskMethodGenerationRequest,DeskMethodGenerationResult} from '../desk-method-execution.js';
import type {DeskSourceSnapshot} from '../desk-memory-context.js';
import {authorizedActor,ProductError} from '../domain/queries.js';
import {deskDigest,mutateDesk,ownedDeskRoom,type DeskSql} from './domain.js';
import {effectiveMethodSettings,lockMethodSettings} from './method-settings.js';
import {claimedMethodJob,methodEvent,methodJobsTable,type MethodJob,type MethodJobOutcome,type MethodPins} from './method-jobs.js';

export interface MethodSourceContext {
 sourceSnapshot():Promise<DeskSourceSnapshot>;
 withAuthorityFence<T>(expected:string,work:(client:DeskSql)=>Promise<T>,validate?:()=>Promise<void>):Promise<T>;
 close():Promise<void>;
}
export interface MethodWorkerOptions {
 openContext(stores:PostgresStoreSet,job:MethodJob):Promise<MethodSourceContext>;
 generate(stores:PostgresStoreSet,request:DeskMethodGenerationRequest):Promise<DeskMethodGenerationResult>;
}
async function deskState(client:DeskSql,job:MethodJob,authority:string){
 await ownedDeskRoom(client,job.actor_id,job.room_id,true);
 const rows=(await client.query('SELECT * FROM quellight_product_v1.desk_items WHERE actor_id=$1 AND room_id=$2 ORDER BY id',[job.actor_id,job.room_id])).rows;
 const method=rows.find(row=>row.is_method);
 if(method?.archived_at)throw new ProductError('DESK_METHOD_ARCHIVED',409);
 if(method?.attention==='put-away')throw new ProductError('DESK_METHOD_PUT_AWAY',409);
 const eligible=rows.filter(row=>!row.archived_at&&(row.derivation_authority_revision===null||row.derivation_authority_revision===authority));
 const index=eligible.filter(row=>!row.is_method&&row.attention!=='put-away').map(row=>({id:row.id,revision:row.revision,title:row.title,kind:row.kind,status:row.status,attention:row.attention}));
 return{method,index,priorMethod:method&&eligible.includes(method)?method.body:null,
  revision:deskDigest(rows.map(row=>({id:row.id,revision:row.revision,derivation:row.derivation_authority_revision})))};
}
const retryAttemptCodes=new Set(['DESK_METHOD_GENERATION_INTERRUPTED','DESK_METHOD_ATTEMPT_TERMINAL','DESK_METHOD_GENERATION_FAILED']);
const supersededCodes=new Set(['DESK_METHOD_SOURCE_CHANGED','DESK_METHOD_CONFIGURATION_CHANGED','DESK_METHOD_DESK_CHANGED','DESK_AUTHORITY_CHANGED','DESK_SOURCE_CHANGED','DESK_METHOD_ARCHIVED','DESK_METHOD_PUT_AWAY','ROOM_ARCHIVED']);

/** Separate durable generation and publication. Caller owns delivery claims and settlement. */
export function createMethodJobProcessor(options:MethodWorkerOptions){
 return async function process(job:MethodJob,stores:PostgresStoreSet,deadline:Date):Promise<MethodJobOutcome>{
  let context:MethodSourceContext|undefined;
  const owner={id:job.actor_id,actorId:job.actor_id,email:''};
  const remaining=deadline.getTime()-Date.now();if(remaining<=0)return{state:'retryable',code:'DESK_METHOD_HOST_WINDOW_ENDED'};
  const claim=await stores.coordination.acquire({scopeId:`quellight:desk-method-job:${job.id}`,actorId:job.actor_id,ownerId:randomUUID(),leaseMs:remaining});
  if(claim.status!=='acquired')return{state:'retryable',code:'DESK_METHOD_JOB_BUSY'};
  const fenced=stores.forLease(claim.lease);
  async function current(){return(await stores.coordination.pool.query(`SELECT * FROM ${methodJobsTable} WHERE id=$1 AND actor_id=$2`,[job.id,job.actor_id])).rows[0] as MethodJob|undefined;}
  async function governed<T>(stage:string,work:(runId:string)=>Promise<T>):Promise<T>{
   await authorizedActor(stores,owner,'app.data.write');
   const runId=`desk-method:${job.id}:${stage}:${randomUUID()}`,permission=`quellight.desk.method.${stage}`;
   let failure:unknown;const runtime=createRuntime({stores:fenced,ids:{runId:()=>runId},payloadRetention:'full',authority:{grants:[permission]}});
   runtime.registerCapability({id:permission,revision:'1',effect:'write',permissions:[permission],input:neutralJsonContract,output:neutralJsonContract,
    invoke:async()=>{try{return await work(runId);}catch(error){failure=error;throw error;}}});
   const activation=await runtime.activate({id:permission,entry:'write',nodes:[{id:'write',capability:permission}],edges:[]});
   if(!activation.ok)throw new ProductError('DESK_METHOD_CONFIGURATION_INVALID',503);
   await runtime.run({jobId:job.id,stage,claimToken:job.claim_token},{mode:'normal'});
   const run=await fenced.execution.getRun(runId);if(run?.status!=='completed')throw failure??new ProductError('DESK_METHOD_WRITE_UNCONFIRMED',503);
   return run.output as T;
  }
  async function withPins<T>(pins:MethodPins,work:(client:DeskSql,fresh:MethodJob)=>Promise<T>){
   return context!.withAuthorityFence(pins.authorityRevision,async client=>{
    await lockMethodSettings(client,job.actor_id);
    const settings=await effectiveMethodSettings(client,job.actor_id,job.room_id);
    if(!settings.enabled||settings.revision!==pins.settingsRevision)throw new ProductError('DESK_METHOD_CONFIGURATION_CHANGED',409);
    const state=await deskState(client,job,pins.authorityRevision);
    if(state.revision!==pins.deskRevision)throw new ProductError('DESK_METHOD_DESK_CHANGED',409);
    const fresh=await claimedMethodJob(client,job);
    if(fresh.pinned?.revision!==pins.revision)throw new ProductError('DESK_METHOD_CONFIGURATION_CHANGED',409);
    return work(client,fresh);
   },async()=>{await authorizedActor(stores,owner,'app.data.write');if((await context!.sourceSnapshot()).revision!==pins.sourceRevision)throw new ProductError('DESK_METHOD_SOURCE_CHANGED',409);});
  }
  try{
   await authorizedActor(stores,owner,'app.data.write');
   let saved=await current();if(!saved)throw new ProductError('DESK_METHOD_UNAVAILABLE',404);
   // Durable publication remains true even if the original runtime acknowledgement was lost.
   if(saved.published_item_id)return{state:'completed'};
   context=await options.openContext(stores,job);
   if(!saved.pinned){
    const sources=await context.sourceSnapshot();
    const pin=await governed<MethodPins|null>('prepare',()=>context!.withAuthorityFence(sources.authorityRevision,async client=>{
     await lockMethodSettings(client,job.actor_id);const settings=await effectiveMethodSettings(client,job.actor_id,job.room_id);
     const fresh=await claimedMethodJob(client,job);if(fresh.pinned)return fresh.pinned;
     if(!settings.enabled)return null;
     const state=await deskState(client,job,sources.authorityRevision);
     const input=JSON.stringify({conversation:sources.messages,desk:{index:state.index,priorMethod:state.priorMethod},successfulCreateInvocationIds:job.create_invocation_ids});
     const value={schema:'quellight.desk-method-pins@1' as const,authorityRevision:sources.authorityRevision,sourceRevision:sources.revision,sourceMessageIds:sources.messages.map(m=>m.id),
      settingsRevision:settings.revision,deskRevision:state.revision,methodId:state.method?.id??null,methodRevision:state.method?.revision??0,instructions:settings.prompt,input};
     const pins={...value,revision:deskDigest(value)},attemptId=randomUUID();
     await client.query(`UPDATE ${methodJobsTable} SET pinned=$2::jsonb,attempt_id=$3,updated_at=now() WHERE id=$1`,[job.id,JSON.stringify(pins),attemptId]);
     await methodEvent(client,job.id,'pinned',null,{revision:pins.revision,attemptId});return pins;
    },async()=>{if((await context!.sourceSnapshot()).revision!==sources.revision)throw new ProductError('DESK_METHOD_SOURCE_CHANGED',409);}));
    if(!pin)return{state:'superseded',code:'DESK_METHOD_DISABLED'};saved=(await current())!;
   }
   const pins=saved.pinned!;
   // Validate again before provider execution. This read/write stage also proves delivery ownership.
   await governed('validate',()=>withPins(pins,async(_client,fresh)=>({revision:fresh.pinned!.revision})));
   if(!saved.prepared){
    if(!saved.attempt_id){await governed('new-attempt',()=>withPins(pins,async(client,fresh)=>{
     if(!fresh.attempt_id){const attemptId=randomUUID();await client.query(`UPDATE ${methodJobsTable} SET attempt_id=$2,updated_at=now() WHERE id=$1`,[job.id,attemptId]);await methodEvent(client,job.id,'attempt',null,{attemptId});}return{saved:true};
    }));saved=(await current())!;}
    const result=await options.generate(stores,{jobId:job.id,attemptId:saved.attempt_id!,actorId:job.actor_id,instructions:pins.instructions,input:pins.input,revision:pins.revision,deadline});
    if(!result.text?.trim()||result.executionRef.status!=='completed'||result.executionRef.jobId!==job.id||result.executionRef.attemptId!==saved.attempt_id)throw new ProductError('DESK_METHOD_OUTPUT_UNAVAILABLE',503);
    await governed('checkpoint',runId=>withPins(pins,async(client,fresh)=>{
     if(fresh.prepared){if(deskDigest(fresh.prepared)!==deskDigest(result))throw new ProductError('DESK_METHOD_RESULT_CONFLICT',409);return{prepared:true};}
     await client.query(`UPDATE ${methodJobsTable} SET prepared=$2::jsonb,updated_at=now() WHERE id=$1`,[job.id,JSON.stringify(result)]);
     await methodEvent(client,job.id,'prepared',null,{runId,executionRef:result.executionRef,resultDigest:deskDigest(result)});return{prepared:true};
    }));saved=(await current())!;
   }
   await governed('publish',runId=>withPins(pins,async(client,fresh)=>{
    if(fresh.published_item_id)return{itemId:fresh.published_item_id,revision:fresh.published_revision};
    if(!fresh.prepared)throw new ProductError('DESK_METHOD_OUTPUT_UNAVAILABLE',503);
    const prior=pins.methodId?(await client.query('SELECT * FROM quellight_product_v1.desk_items WHERE id=$1 AND actor_id=$2',[pins.methodId,job.actor_id])).rows[0]:undefined;
    const result=await mutateDesk(client,job.actor_id,pins.methodId?'desk.save':'desk.create',{
     roomId:job.room_id,...(prior?{itemId:prior.id,expectedRevision:pins.methodRevision}:{}),title:prior?.title??'Room method',body:fresh.prepared.text,
     kind:prior?.kind??'method',status:prior?.status??'',attention:'carried'},
     {authorKind:'method',commandKey:`desk-method:${job.id}`,jobId:job.id,turnId:job.turn_id,conversationId:job.conversation_id,authorityRevision:pins.authorityRevision,sourceMessageIds:pins.sourceMessageIds});
    await client.query(`UPDATE ${methodJobsTable} SET published_item_id=$2,published_revision=$3,publish_run_id=$4,updated_at=now() WHERE id=$1`,[job.id,result.item.id,result.item.revision,runId]);
    await methodEvent(client,job.id,'published',null,{runId,itemId:result.item.id,revision:result.item.revision});return{itemId:result.item.id,revision:result.item.revision};
   }));
   return{state:'completed'};
  }catch(error){
   const saved=await current();if(saved?.published_item_id)return{state:'completed'};
   const code=error instanceof ProductError?error.code:typeof (error as {code?:unknown})?.code==='string'?(error as {code:string}).code:'DESK_METHOD_UNCONFIRMED';
   if(retryAttemptCodes.has(code)&&saved?.pinned&&context){
    // Only the executor's proven terminal result permits a fresh generation identity.
    try{await governed('retire-attempt',()=>withPins(saved.pinned!,async(client,fresh)=>{
     if(!fresh.prepared){await client.query(`UPDATE ${methodJobsTable} SET attempt_id=NULL,updated_at=now() WHERE id=$1`,[job.id]);await methodEvent(client,job.id,'attempt-terminal',code,{attemptId:fresh.attempt_id});}return{retired:true};
    }));}catch{/* Original outcome remains retryable; a later delivery reconciles the same attempt. */}
   }
   if(supersededCodes.has(code))return{state:'superseded',code};
   if(['DESK_METHOD_OUTPUT_UNAVAILABLE','DESK_METHOD_CONFIGURATION_INVALID','DESK_METHOD_RESULT_CONFLICT','VICT_ACTOR_UNAUTHENTICATED','VICT_ACTOR_SCOPE_DENIED'].includes(code))return{state:'blocked',code};
   return{state:'retryable',code:code.startsWith('DESK_')||code.startsWith('MEMORY_')?code:'DESK_METHOD_UNCONFIRMED'};
  }finally{try{await context?.close();}finally{await stores.coordination.release(claim.lease);}}
 };
}
