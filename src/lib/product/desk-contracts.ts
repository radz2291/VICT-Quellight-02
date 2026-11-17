import { defineContract, neutralJsonContract, type ApplicationDefinitionV3, type ResourceDefinition } from '@victframework/sdk';

export type DeskAttention = 'carried' | 'within-reach' | 'put-away';
export type DeskAuthorKind = 'owner' | 'agent' | 'method';
export interface DeskItem {
  id: string; roomId: string; title: string; body: string; kind: string; status: string;
  attention: DeskAttention; archivedAt: string | null; revision: number; isMethod: boolean;
  createdAt: string; updatedAt: string;
}
export interface DeskHistoryEntry extends Omit<DeskItem, 'createdAt' | 'updatedAt'> {
  createdAt: string; authorKind: DeskAuthorKind; operation: string;
}
export type DeskActionId = 'desk.create' | 'desk.save' | 'desk.edit' | 'desk.append' | 'desk.archive' | 'desk.restore' | 'desk.restore-version';
export interface DeskActionInput {
  roomId: string; itemId?: string; expectedRevision?: number; title?: string; body?: string;
  kind?: string; status?: string; attention?: DeskAttention; search?: string; replacement?: string; text?: string; restoreRevision?: number;
}
export const deskActionIds: readonly DeskActionId[] = ['desk.create','desk.save','desk.edit','desk.append','desk.archive','desk.restore','desk.restore-version'];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function deskInputContract(id: DeskActionId) {
  const fields = ['roomId', ...(id === 'desk.create' ? [] : ['itemId','expectedRevision']),
    ...(['desk.create','desk.save'].includes(id) ? ['title','body','kind','status','attention'] : []),
    ...(id === 'desk.edit' ? ['search','replacement'] : []), ...(id === 'desk.append' ? ['text'] : []),
    ...(id === 'desk.restore-version' ? ['restoreRevision'] : [])];
  return defineContract<DeskActionInput>({ id: `quellight.${id}.input`, revision: '1',
    presentationFields: Object.fromEntries(fields.map(key => [key,key.endsWith('Revision') ? 'number' : 'string'])),
    descriptiveJsonSchema: { type: 'object', additionalProperties: false, required: fields.filter(key => id !== 'desk.create' || key !== 'attention'),
      properties: Object.fromEntries(fields.map(key => [key, key.endsWith('Revision') ? { type: 'integer', minimum: 1 } : key === 'attention'
        ? { type: 'string', enum: ['carried','within-reach','put-away'] } : { type: 'string' }])) },
    parse(input) {
      const invalid = { ok: false as const, issues: [{ code:'DESK_INPUT_INVALID',path:'(root)',message:'Check the Desk item.' }] };
      if (!input || typeof input !== 'object' || Array.isArray(input) || ![Object.prototype,null].includes(Object.getPrototypeOf(input))) return invalid;
      const own = Object.getOwnPropertyDescriptors(input); const value: Record<string, unknown> = {};
      for (const key of Reflect.ownKeys(own)) {
        if (typeof key !== 'string' || !fields.includes(key) || !own[key].enumerable || !('value' in own[key])) return invalid;
      }
      for (const key of fields) {
        const v = own[key]?.value ?? (id === 'desk.create' && key === 'attention' ? 'within-reach' : undefined);
        if (key.endsWith('Revision') ? !Number.isSafeInteger(v) || v < 1 : typeof v !== 'string') return invalid;
        value[key] = v;
      }
      if (!uuid.test(value.roomId as string) || ('itemId' in value && !uuid.test(value.itemId as string))) return invalid;
      if ('title' in value && (!(value.title as string).trim() || (value.title as string).length > 200)) return invalid;
      if ('attention' in value && !['carried','within-reach','put-away'].includes(value.attention as string)) return invalid;
      if ('search' in value && value.search === '') return invalid;
      return { ok: true as const, value: value as unknown as DeskActionInput };
    },
  });
}
export const deskActionBindings = Object.fromEntries(deskActionIds.map(id => [id, { id, capabilityId:`quellight.${id}`,permission:`quellight.${id}`,
  input:deskInputContract(id),output:neutralJsonContract }])) as Record<DeskActionId, {id:DeskActionId;capabilityId:string;permission:string;input:ReturnType<typeof deskInputContract>;output:typeof neutralJsonContract}>;
export const deskContracts = Object.values(deskActionBindings).map(value=>value.input);
export const deskActions: ApplicationDefinitionV3['actions'] = Object.values(deskActionBindings).map(b=>({kind:'mutation',id:b.id,revision:'1',
  resourceId:'quellight.desk',resourceRevision:'1',op:b.id,inputContractId:b.input.id,inputContractRevision:'1',outputContractId:b.output.id,outputContractRevision:b.output.revision}));
export const deskResource: ResourceDefinition = {schema:'vict.resource@1',id:'quellight.desk',revision:'1',identity:{key:'id'},
  fields:[{name:'id',type:'string',required:true}],mutations:Object.values(deskActionBindings).map(b=>({op:b.id,effect:'write',inputContractId:b.input.id,outputContractId:b.output.id,permissions:[b.permission]}))};

export type DeskMethodSettingsActionId='desk.method.settings.save'|'desk.method.settings.restore';
export interface DeskMethodSettingsInput {target:'app'|'room';roomId:string;expectedRevision:number;content?:string;restoreRevision?:number}
export interface AppDeskMethodSettings {enabled:boolean;prompt:string}
export interface RoomDeskMethodSettings {enabled:'inherit'|'enabled'|'disabled';prompt:{mode:'inherit'|'custom';text:string}}
export interface DeskMethodSettingsSnapshot {target:'app'|'room';roomId:string;revision:number;content:AppDeskMethodSettings|RoomDeskMethodSettings;createdAt:string|null;operation:'initial'|'save'|'restore'}
const methodBinding=(id:DeskMethodSettingsActionId)=>{
  const fields=['target','roomId','expectedRevision',id.endsWith('.save')?'content':'restoreRevision'];
  const input=defineContract<DeskMethodSettingsInput>({id:`quellight.${id}.input`,revision:'1',presentationFields:Object.fromEntries(fields.map(k=>[k,k.endsWith('Revision')?'number':'string'])),
    parse(raw){const fail={ok:false as const,issues:[{code:'DESK_METHOD_SETTINGS_INVALID',path:'(root)',message:'Check method settings.'}]};
      if(!raw||typeof raw!=='object'||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return fail;
      const own=Object.getOwnPropertyDescriptors(raw),value:Record<string,unknown>={};
      if(Reflect.ownKeys(own).length!==fields.length)return fail;
      for(const key of Reflect.ownKeys(own)){if(typeof key!=='string'||!fields.includes(key)||!own[key].enumerable||!('value'in own[key]))return fail;const v=own[key].value;
        if(key.endsWith('Revision')?!Number.isSafeInteger(v)||v<0:typeof v!=='string')return fail;value[key]=v;}
      if(!['app','room'].includes(value.target as string)||(value.target==='app'?value.roomId!=='':!uuid.test(value.roomId as string)))return fail;
      return{ok:true as const,value:value as unknown as DeskMethodSettingsInput};}});
  return{id,capabilityId:`quellight.${id}`,permission:`quellight.${id}`,input,output:neutralJsonContract};
};
export const deskMethodSettingsBindings={'desk.method.settings.save':methodBinding('desk.method.settings.save'),'desk.method.settings.restore':methodBinding('desk.method.settings.restore')};
export const deskMethodSettingsContracts=Object.values(deskMethodSettingsBindings).map(b=>b.input);
export const deskMethodSettingsActions:ApplicationDefinitionV3['actions']=Object.values(deskMethodSettingsBindings).map(b=>({kind:'mutation',id:b.id,revision:'1',resourceId:'quellight.desk-method-settings',resourceRevision:'1',op:b.id,inputContractId:b.input.id,inputContractRevision:'1',outputContractId:b.output.id,outputContractRevision:b.output.revision}));
export const deskMethodSettingsResource:ResourceDefinition={schema:'vict.resource@1',id:'quellight.desk-method-settings',revision:'1',identity:{key:'id'},fields:[{name:'id',type:'string',required:true}],mutations:Object.values(deskMethodSettingsBindings).map(b=>({op:b.id,effect:'write',inputContractId:b.input.id,outputContractId:b.output.id,permissions:[b.permission]}))};
