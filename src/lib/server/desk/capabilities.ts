import { defineContract, neutralJsonContract, type CapabilityDefinition, type CapabilityContext } from '@victframework/sdk';
import type { PostgresStoreSet } from '@victframework/store-postgres';
import { deskActionBindings, type DeskActionId } from '../../product/desk-contracts.js';
import { authorizedActor, ProductError, type Owner } from '../domain/queries.js';
import { deskDigest, getDeskItem, listDesk, mutateDesk, type DeskProvenance, type DeskSql } from './domain.js';
import type { DeskAuthorityReader } from './context.js';

export interface DeskToolBinding { conversationId:string; authorityRevision:string; sourceMessageIds:readonly string[]; authority:DeskAuthorityReader;
  withAuthorityFence<T>(expectedRevision:string,work:(client:DeskSql)=>Promise<T>):Promise<T> }
const summaries={read:'Read the current full Desk item by ID in this room.',list:'List the available Desk item index in this room; put-away items are absent.',search:'Deliberately search all active eligible Desk items, including put-away items.'};
const readContract=(mode:'read'|'list'|'search')=>defineContract<Record<string,string>>({id:`quellight.desk.${mode}.input`,revision:'1',
  descriptiveJsonSchema:{type:'object',additionalProperties:false,properties:Object.fromEntries((mode==='read'?['itemId']:mode==='search'?['query','cursor']:['cursor']).map(k=>[k,{type:'string'}])),required:mode==='read'?['itemId']:mode==='search'?['query']:[]},
  parse(input){const fields=mode==='read'?['itemId']:mode==='search'?['query','cursor']:['cursor'];
    const fail={ok:false as const,issues:[{code:'DESK_QUERY_INVALID',path:'(root)',message:'Check the Desk request.'}]};
    if(!input||typeof input!=='object'||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))return fail;
    const descriptors=Object.getOwnPropertyDescriptors(input);const value:Record<string,string>={};
    for(const key of Reflect.ownKeys(descriptors)){if(typeof key!=='string'||!fields.includes(key)||!('value'in descriptors[key])||typeof descriptors[key].value!=='string')return fail;value[key]=descriptors[key].value;}
    if(mode==='read'&&!value.itemId||mode==='search'&&!value.query?.trim())return fail;return{ok:true as const,value};}});

/** Definitions are inert until the actual VICT bridge grants/records each invocation. */
export function createDeskCapabilities(stores:PostgresStoreSet,owner:Owner,roomId:string,turnId:string,binding:DeskToolBinding) {
  const pinned={...binding,sourceMessageIds:[...binding.sourceMessageIds]};
  async function authorize(id:string,context:CapabilityContext,write:boolean) {
    await authorizedActor(stores,owner,write?'app.data.write':'app.data.read');
    const c=context as unknown as {victInvocationId?:string;victTurnId?:string;victActorId?:string};
    const invocation=c.victInvocationId?await stores.invocations.getInvocation(c.victInvocationId):undefined;
    const turn=await stores.turns.getTurn(turnId);
    if(c.victTurnId!==turnId||c.victActorId!==owner.actorId||!turn||turn.actorId!==owner.actorId||turn.status!=='running'||!invocation||
      invocation.turnId!==turnId||invocation.actorId!==owner.actorId||invocation.capabilityId!==id||invocation.capabilityRevision!=='1'||invocation.status!=='running')throw new ProductError('DESK_INVOCATION_REQUIRED',403);
    if((await pinned.authority.read()).revision!==pinned.authorityRevision)throw new ProductError('DESK_SOURCE_CHANGED',409);
    return invocation;
  }
  const capabilities:CapabilityDefinition[]=[];
  for(const mode of ['read','list','search'] as const){const id=`quellight.desk.${mode}`;
    capabilities.push({id,revision:'1',effect:'read',description:summaries[mode],permissions:[id],input:readContract(mode),output:neutralJsonContract,
      invoke:async(value:Record<string,string>,context)=>{
        const invocation=await authorize(id,context,false);
        const result=mode==='read'?{item:(await getDeskItem(stores,owner,roomId,value.itemId,pinned.authorityRevision)).item}
          :await listDesk(stores,owner,roomId,{model:true,authorityRevision:pinned.authorityRevision,query:mode==='search'?value.query:undefined,cursor:value.cursor||undefined});
        if((await pinned.authority.read()).revision!==pinned.authorityRevision)throw new ProductError('DESK_SOURCE_CHANGED',409);
        if('item'in result)await pinned.withAuthorityFence(pinned.authorityRevision,client=>client.query(`INSERT INTO quellight_product_v1.desk_reads
          (actor_id,room_id,turn_id,invocation_id,item_id,item_revision,title,authority_revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(actor_id,invocation_id) DO NOTHING`,
          [owner.actorId,roomId,turnId,invocation.invocationId,result.item.id,result.item.revision,result.item.title,pinned.authorityRevision]));
        if('items'in result)return{items:result.items.map(({body,...item})=>item),nextCursor:result.nextCursor};return result;
      }});
  }
  for(const actionId of Object.keys(deskActionBindings) as DeskActionId[]){const action=deskActionBindings[actionId];
    capabilities.push({id:action.capabilityId,revision:'1',effect:'write',permissions:[action.permission],input:action.input,output:neutralJsonContract,
      invoke:async(value,context)=>{
        const parsed=action.input.parse(value);if(!parsed.ok)throw new ProductError('ACTION_INPUT_INVALID');
        if(parsed.value.roomId!==roomId)throw new ProductError('DESK_ROOM_MISMATCH',403);
        const invocation=await authorize(action.capabilityId,context,true);
        const toolCallId=(context as unknown as {victToolCallId?:string}).victToolCallId;
        if(!toolCallId)throw new ProductError('DESK_INVOCATION_REQUIRED',403);
        const commandKey=`desk-tool:${deskDigest([turnId,toolCallId,action.capabilityId])}`;
        return pinned.withAuthorityFence(pinned.authorityRevision,async client=>{
          const provenance:DeskProvenance={authorKind:'agent',commandKey,turnId,conversationId:pinned.conversationId,invocationId:invocation.invocationId,
            authorityRevision:pinned.authorityRevision,sourceMessageIds:pinned.sourceMessageIds};
          return mutateDesk(client,owner.actorId,actionId,parsed.value,provenance);
        });
      }});
  }
  return {capabilities,identities:capabilities.map(({id,revision})=>({id,revision})),permissions:capabilities.flatMap(c=>c.permissions??[]),
    quietWriteApprovals:{policyIdentity:'quellight.desk-collaboration@1',entries:capabilities.filter(c=>c.effect==='write').map(c=>({capabilityId:c.id,capabilityRevision:c.revision}))}};
}
