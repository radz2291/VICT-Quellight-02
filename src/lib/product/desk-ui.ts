import type { UiNode, UiExpression, UiLocalStateDecl, UiStyleDeclaration } from '@victframework/ui';
import type { ApplicationDefinitionV3 } from '@victframework/sdk';
import { rheaNativePatterns } from '@victframework/ui-svelte/rhea';

const l=(value:string|number|boolean):UiExpression=>({type:'literal',value}), r=(path:string):UiExpression=>({type:'ref',path});
const st=(property:string,value:string):UiStyleDeclaration=>({property,value:{type:'text',value}});
const el=(id:string,tag:string,children:string[],classes:string[]=[]):Extract<UiNode,{kind:'element'}>=>({kind:'element',id,tag,children,classes});
const txt=(id:string,value:string,ref=false):UiNode=>({kind:'text',id,content:ref?{type:'expression',expression:r(value)}:{type:'literal',value}});
const cond=(id:string,when:string,children:string[]):UiNode=>({kind:'conditional',id,branches:[{when,children}]});
const quiet=[st('background','transparent'),st('color','var(--vict-color-textMuted)'),st('border-color','transparent'),st('font-size','13px'),st('font-weight','400'),st('min-height','36px'),st('padding','6px 10px')];
function button(id:string,label:string,actionId:string,input?:Record<string,UiExpression>,disabled='pending'):UiNode {
  return {kind:'component',id,definitionId:'vict.catalog.button',revision:'1',props:{label:l(label),disabled:r(`view.${disabled}`)},outputs:{press:{invokeAction:{actionId,...(input?{input}:{})}}},localStyle:quiet};
}
function copy(id:string,value:string,ref=false):Record<string,UiNode>{return {[id]:el(id,'p',[`${id}-text`],['ql-muted']),[`${id}-text`]:txt(`${id}-text`,value,ref)};}
function field(id:string,key:string,label:string,mode:'input'|'textarea'|'native-select'='input',options?:string,disabled='deskReadOnly'):Record<string,UiNode>{
  const fragment=rheaNativePatterns.find(p=>p.id===mode)!.create(id),nodes=Object.fromEntries(fragment.nodes.map(n=>[n.id,n])) as Record<string,UiNode>;
  const control=nodes[`${id}-control`] as Extract<UiNode,{kind:'element'}>;
  nodes[id]=el(id,'div',[`${id}-label`,`${id}-control`],['vict-rhea','vict-rhea-field','ql-desk-field']);nodes[`${id}-label-text`]=txt(`${id}-label-text`,label);
  nodes[`${id}-control`]={...control,children:options?[`${id}-options`]:[],attributes:{id:`${id}-control`,name:key,value:r(`state.${key}`),disabled:r(`view.${disabled}`),...(key==='dSearch'?{placeholder:'Search titles and text…'}:{}),...(mode==='textarea'?{rows:'12'}:mode==='input'?{type:'text'}:{})},interactions:[{on:'change',action:'setState',key,value:r(`state.${key}`)}]};
  for(const suffix of ['help','help-text','option-first','option-second','first-text','second-text'])delete nodes[`${id}-${suffix}`];
  if(options){nodes[`${id}-options`]={kind:'repeat',id:`${id}-options`,collection:r(`view.${options}`),key:r('repeat.option.value'),itemName:'option',templateRoot:`${id}-option`};nodes[`${id}-option`]={kind:'element',id:`${id}-option`,tag:'option',children:[`${id}-option-label`],attributes:{value:r('repeat.option.value')}};nodes[`${id}-option-label`]=txt(`${id}-option-label`,'repeat.option.label',true);}
  return nodes;
}
function disclosure(id:string,label:string,children:string[]):Record<string,UiNode>{return {
  [id]:{kind:'component',id,definitionId:'vict.catalog.collapsible',revision:'1',classes:['ql-memory-disclosure'],props:{label:l(label),open:r(`state.${id}Open`)},outputs:{openChange:{setState:{key:`${id}Open`}}},slots:{trigger:{name:'trigger',children:[`${id}-label`,`${id}-chevron`]},content:{name:'content',children}},partStyles:{trigger:{localStyle:[...quiet,st('width','100%'),st('justify-content','space-between'),st('padding','6px 0')]},content:{localStyle:[st('padding','8px 0')]}}},
  [`${id}-label`]:txt(`${id}-label`,label),[`${id}-chevron`]:{kind:'component',id:`${id}-chevron`,definitionId:'vict.media.icon',revision:'1',props:{pack:l('lucide'),name:l('chevron-down'),revision:l('1.27.0'),size:l(15),decorative:l(true)}}};}
function confirm(id:string,label:string,title:string,description:string,actionId:string,disabled='deskCannotMutate'):Record<string,UiNode>{return {
  [id]:{kind:'component',id,definitionId:'vict.catalog.alert-dialog',revision:'1',props:{open:r(`state.${id}Open`),label:l(label),title:l(title),description:l(description),confirmLabel:l(label),cancelLabel:l('Cancel'),disabled:r(`view.${disabled}`)},slots:{body:{name:'body',children:[`${id}-body`]}},outputs:{openChange:{setState:{key:`${id}Open`}},confirm:{invokeAction:{actionId}}},partStyles:{trigger:{localStyle:quiet}}},[`${id}-body`]:el(`${id}-body`,'div',[])};}

export const deskNodes:Record<string,UiNode>={
  deskContextLoad:button('deskContextLoad','Show Desk context','ui.desk.context',undefined,'deskCannotContext'),
  ...copy('deskContextCopy','view.deskContextText',true),
  deskPage:{...el('deskPage','section',['deskTop','deskStatus','deskLayout'],['ql-desk-page']),attributes:{'data-detail':r('view.deskHasDetail')}},
  deskTop:el('deskTop','div',['deskBackConversation','deskTopActions'],['ql-desk-top']),
  deskBackConversation:button('deskBackConversation','Back to conversation','ui.desk.close'),
  deskTopActions:el('deskTopActions','div',['deskMethodLink','deskNew'],['ql-button-row']),deskNew:button('deskNew','New item','ui.desk.new',undefined,'deskCannotCreate'),
  deskMethodLink:button('deskMethodLink','Room method','ui.desk.method'),
  deskMethodPage:el('deskMethodPage','section',['deskMethodBack','deskMethodTitle','deskMethodIntro','deskMethodStatus','deskMethodSavedWrap','deskMethodLoadingWrap','deskMethodSettingsWrap'],['ql-room-page','ql-method-page']),
  deskMethodBack:button('deskMethodBack','Back','ui.desk.method.close'),
  deskMethodTitle:el('deskMethodTitle','h1',['deskMethodTitleText']),deskMethodTitleText:txt('deskMethodTitleText','view.deskMethodTitle',true),
  ...copy('deskMethodIntro','view.deskMethodIntro',true),...copy('deskMethodStatus','view.deskMethodStatus',true),
  deskMethodSavedWrap:cond('deskMethodSavedWrap','deskMethodRoom',['deskMethodSaved','deskMethodItemWrap','deskMethodActivity']),
  deskMethodSaved:{kind:'component',id:'deskMethodSaved',definitionId:'vict.ai.markdown',revision:'1',props:{text:r('view.deskMethodText')},classes:['ql-desk-markdown']},
  deskMethodItemWrap:cond('deskMethodItemWrap','deskHasMethodItem',['deskMethodEdit']),deskMethodEdit:button('deskMethodEdit','Edit method and view versions','ui.desk.method.item'),
  ...disclosure('deskMethodActivity','Method activity',['deskMethodActivityCopy']),...copy('deskMethodActivityCopy','view.deskMethodActivityText',true),
  deskMethodLoadingWrap:cond('deskMethodLoadingWrap','deskMethodLoading',['deskMethodLoadingCopy']),...copy('deskMethodLoadingCopy','Opening saved method settings…'),
  deskMethodSettingsWrap:cond('deskMethodSettingsWrap','deskMethodReady',['deskMethodForm']),
  deskMethodForm:el('deskMethodForm','div',['deskMethodLearning','deskMethodEffective','deskMethodPromptModeWrap','deskMethodPromptWrap','deskMethodButtons','deskMethodRetryWrap','deskMethodConflictWrap','deskMethodHistory'],['ql-form']),
  ...field('deskMethodLearning','dMethodEnabled','Learn a working method','native-select','deskMethodEnabledOptions','deskMethodReadOnly'),
  ...copy('deskMethodEffective','view.deskMethodEffectiveText',true),
  deskMethodPromptModeWrap:cond('deskMethodPromptModeWrap','deskMethodRoom',['deskMethodPromptMode']),...field('deskMethodPromptMode','dMethodPromptMode','Method instructions','native-select','deskMethodPromptOptions','deskMethodReadOnly'),
  deskMethodPromptWrap:cond('deskMethodPromptWrap','deskMethodCustom',['deskMethodPrompt']),...field('deskMethodPrompt','dMethodPrompt','Method learning instructions','textarea',undefined,'deskMethodReadOnly'),
  deskMethodButtons:el('deskMethodButtons','div',['deskMethodSave'],['ql-button-row']),deskMethodSave:button('deskMethodSave','Save method settings','ui.desk.method.save',undefined,'deskMethodCannotSave'),
  deskMethodRetryWrap:cond('deskMethodRetryWrap','deskMethodUncertain',['deskMethodRetryCopy','deskMethodRetry']),...copy('deskMethodRetryCopy','The response was interrupted. Retry the same settings change to check its saved result.'),deskMethodRetry:button('deskMethodRetry','Retry settings change','ui.desk.method.retry'),
  deskMethodConflictWrap:cond('deskMethodConflictWrap','deskMethodConflict',['deskMethodConflictCopy','deskMethodReload']),...copy('deskMethodConflictCopy','These settings changed elsewhere. Your draft is kept until you reload the saved settings.'),...confirm('deskMethodReload','Reload method settings','Replace the settings draft?','Saved settings will replace these unsaved changes.','ui.desk.method.reload','pending'),
  ...disclosure('deskMethodHistory','Settings versions',['deskMethodVersion','deskMethodHistoryShow','deskMethodHistoryCopy','deskMethodRestore']),
  ...field('deskMethodVersion','dMethodVersion','Settings version','native-select','deskMethodHistoryOptions','pending'),deskMethodHistoryShow:button('deskMethodHistoryShow','Show settings version','ui.desk.method.history'),
  ...copy('deskMethodHistoryCopy','view.deskMethodHistoryText',true),...confirm('deskMethodRestore','Restore settings version','Restore these method settings?','A new settings version will be saved. The current learned method is kept.','ui.desk.method.restore','deskMethodCannotRestore'),
  deskStatus:{...el('deskStatus','p',['deskStatusText'],['ql-desk-status']),attributes:{role:'status','aria-live':'polite'}},deskStatusText:txt('deskStatusText','view.deskStatus',true),
  deskLayout:el('deskLayout','div',['deskList','deskDetailArea'],['ql-desk-layout']),
  deskList:el('deskList','section',['deskSearchRow','deskFilters','deskEmpty','deskRows','deskMoreWrap'],['ql-desk-list']),
  deskSearchRow:el('deskSearchRow','div',['deskSearch','deskSearchButton'],['ql-desk-search-row']),
  ...field('deskSearch','dSearch','Search Desk','input',undefined,'pending'),
  deskFilters:el('deskFilters','div',['deskFilter','deskArchived'],['ql-desk-filters']),
  ...field('deskFilter','dFilter','Attention filter','native-select','deskFilterOptions','pending'),
  deskArchived:{kind:'component',id:'deskArchived',definitionId:'vict.catalog.switch',revision:'1',props:{label:l('Archived'),checked:r('state.dArchived'),disabled:r('view.pending')},outputs:{checkedChange:{setState:{key:'dArchived'}}}},
  deskSearchButton:button('deskSearchButton','Find items','ui.desk.search'),
  deskEmpty:cond('deskEmpty','deskEmpty',['deskEmptyCopy']),...copy('deskEmptyCopy','view.deskEmptyText',true),
  deskRows:{kind:'repeat',id:'deskRows',collection:r('view.deskItems'),key:r('repeat.item.id'),itemName:'item',templateRoot:'deskRow'},
  deskRow:{...button('deskRow','','ui.desk.select',{id:r('repeat.item.id')}) as Extract<UiNode,{kind:'component'}>,props:{label:r('repeat.item.label'),disabled:r('view.pending')},localStyle:[...quiet,st('width','100%'),st('justify-content','flex-start'),st('text-align','left'),st('white-space','pre-line'),st('overflow-wrap','anywhere'),st('line-height','1.65'),st('padding','10px 12px'),st('border-radius','8px'),{property:'background',value:{type:'binding',expression:{type:'conditionalValue',when:r('repeat.item.selected'),then:l('var(--ql-selected)'),otherwise:l('transparent')}}}]},
  deskMoreWrap:cond('deskMoreWrap','deskHasMore',['deskMore']),deskMore:button('deskMore','More items','ui.desk.more'),
  deskDetailArea:el('deskDetailArea','section',['deskDetailChoice'],['ql-desk-detail']),
  deskDetailChoice:{kind:'conditional',id:'deskDetailChoice',branches:[{when:'deskLoading',children:['deskLoadingCopy']},{when:'deskHasDetail',children:['deskDetail']},{when:'deskOpen',children:['deskChoose']}]},
  ...copy('deskLoadingCopy','Opening saved item…'),...copy('deskChoose','Choose an item, or start a new one. Notes, plans and references live here.'),
  deskDetail:el('deskDetail','div',['deskBackList','deskRevision','deskConflictWrap','deskUncertainWrap','deskEditing','deskPreviewWrap','deskItemActions','deskHistoryWrap'],['ql-desk-detail-content']),
  deskBackList:{...button('deskBackList','Back to Desk','ui.desk.list') as Extract<UiNode,{kind:'component'}>,classes:['ql-desk-back-list']},
  ...copy('deskRevision','view.deskRevisionLabel',true),
  deskConflictWrap:cond('deskConflictWrap','deskConflict',['deskConflictCopy','deskReload']),...copy('deskConflictCopy','This item changed elsewhere. Your draft is kept on this device. Review the saved version before replacing it.'),
  ...confirm('deskReload','Reload saved version','Replace this local draft?','The latest saved item will replace this device’s unsaved draft.','ui.desk.reload','pending'),
  deskUncertainWrap:cond('deskUncertainWrap','deskUncertain',['deskUncertainCopy','deskRetry']),...copy('deskUncertainCopy','The save response was interrupted. Retry this same change to check its recorded result. Your draft is kept.'),deskRetry:button('deskRetry','Retry change','ui.desk.retry'),
  deskEditing:cond('deskEditing','deskEditing',['deskFields']),
  deskFields:el('deskFields','div',['deskTitle','deskBody','deskMetadata'],['ql-desk-fields']),
  ...field('deskTitle','dTitle','Item title'),...field('deskBody','dBody','Item text','textarea'),
  ...disclosure('deskMetadata','Details and attention',['deskMetadataFields','deskAttentionHelp']),
  deskMetadataFields:el('deskMetadataFields','div',['deskKind','deskItemStatus','deskAttention'],['ql-desk-metadata']),
  ...field('deskKind','dKind','Kind'),...field('deskItemStatus','dStatus','Status'),...field('deskAttention','dAttention','Attention','native-select','deskAttentionOptions'),
  ...copy('deskAttentionHelp','Carried: included in conversation context. Within reach: listed, then opened when useful. Put away: available through deliberate search. Archiving is separate.'),
  deskPreviewWrap:cond('deskPreviewWrap','deskPreview',['deskPreviewTitle','deskPreviewBody']),deskPreviewTitle:el('deskPreviewTitle','h1',['deskPreviewTitleText']),deskPreviewTitleText:txt('deskPreviewTitleText','state.dTitle',true),
  deskPreviewBody:{kind:'component',id:'deskPreviewBody',definitionId:'vict.ai.markdown',revision:'1',props:{text:r('state.dBody')},classes:['ql-desk-markdown']},
  deskItemActions:el('deskItemActions','div',['deskSaveWrap','deskPreviewToggle','deskArchiveWrap','deskRestoreWrap'],['ql-button-row','ql-desk-item-actions']),
  deskSaveWrap:cond('deskSaveWrap','deskCanEdit',['deskSave']),deskSave:button('deskSave','Save item','ui.desk.save',undefined,'deskCannotSave'),
  deskPreviewToggle:{...button('deskPreviewToggle','','ui.desk.preview') as Extract<UiNode,{kind:'component'}>,props:{label:r('view.deskPreviewLabel'),disabled:r('view.deskArchivedItem')}},
  deskArchiveWrap:cond('deskArchiveWrap','deskCanArchive',['deskArchive']),...confirm('deskArchive','Archive item','Archive this item?','It will leave the active Desk. Its text and versions stay available in Archived.','ui.desk.archive'),
  deskRestoreWrap:cond('deskRestoreWrap','deskArchivedItem',['deskRestore']),deskRestore:button('deskRestore','Restore item','ui.desk.restore',undefined,'deskCannotMutate'),
  deskHistoryWrap:cond('deskHistoryWrap','deskExisting',['deskHistory']),...disclosure('deskHistory','Saved versions',['deskHistorySelect','deskHistoryMoreWrap','deskHistoryShow','deskHistoryText','deskRestoreVersion']),
  deskHistoryMoreWrap:cond('deskHistoryMoreWrap','deskMoreVersions',['deskHistoryMore']),deskHistoryMore:button('deskHistoryMore','Load older versions','ui.desk.history-more'),
  ...field('deskHistorySelect','dHistory','Version','native-select','deskHistoryOptions','pending'),deskHistoryShow:button('deskHistoryShow','Show version','ui.desk.history'),
  ...copy('deskHistoryText','view.deskHistoryText',true),...confirm('deskRestoreVersion','Restore this version','Restore this saved version?','This creates a new revision. Your existing saved versions remain available. Any local draft will be replaced.','ui.desk.restore-version','deskCannotRestoreVersion')
};
export const deskLocalState:Record<string,UiLocalStateDecl>=Object.fromEntries(Object.entries({dTitle:'',dBody:'',dKind:'',dStatus:'',dAttention:'within-reach',dSearch:'',dFilter:'all',dArchived:false,dHistory:'',dPreview:false,deskMetadataOpen:false,deskHistoryOpen:false,deskArchiveOpen:false,deskReloadOpen:false,deskRestoreVersionOpen:false,dMethodEnabled:'inherit',dMethodPromptMode:'inherit',dMethodPrompt:'',dMethodVersion:'',deskMethodActivityOpen:false,deskMethodHistoryOpen:false,deskMethodReloadOpen:false,deskMethodRestoreOpen:false}).map(([key,initial])=>[key,{key,type:typeof initial as 'string'|'boolean',initial}]));
const flags=['deskOpen','deskHasDetail','deskLoading','deskEmpty','deskHasMore','deskMoreVersions','deskConflict','deskUncertain','deskEditing','deskPreview','deskCanEdit','deskCanArchive','deskArchivedItem','deskExisting','deskReadOnly','deskCannotSave','deskCannotMutate','deskCannotCreate','deskCannotRestoreVersion','deskCannotContext','deskMethodOpen','deskMethodRoom','deskHasMethodItem','deskMethodLoading','deskMethodReady','deskMethodCustom','deskMethodReadOnly','deskMethodCannotSave','deskMethodUncertain','deskMethodConflict','deskMethodCannotRestore'] as const;
export const deskConditions=Object.fromEntries(flags.map(id=>[id,{id,kind:'localState' as const,when:r(`view.${id}`)}]));
const textViews=['deskContextText','deskStatus','deskEmptyText','deskRevisionLabel','deskPreviewLabel','deskHistoryText','deskMethodTitle','deskMethodIntro','deskMethodStatus','deskMethodText','deskMethodActivityText','deskMethodEffectiveText','deskMethodHistoryText'];
const optionViews=['deskAttentionOptions','deskFilterOptions','deskHistoryOptions','deskMethodEnabledOptions','deskMethodPromptOptions','deskMethodHistoryOptions'];
export const deskViewFields={...Object.fromEntries(flags.map(id=>[id,'boolean' as const])),...Object.fromEntries(textViews.map(id=>[id,'string' as const])),deskItems:'array','deskItems.id':'string','deskItems.label':'string','deskItems.selected':'boolean',...Object.fromEntries(optionViews.flatMap(key=>[[key,'array'],[`${key}.value`,'string'],[`${key}.label`,'string']]))} as const;
export const deskInitialView={...Object.fromEntries(flags.map(id=>[id,false])),...Object.fromEntries(textViews.map(id=>[id,''])),...Object.fromEntries(optionViews.map(id=>[id,[]])),deskItems:[]};
export const deskInterfaceActions:ApplicationDefinitionV3['actions']=[...['open','close','new','list','search','more','reload','retry','save','preview','archive','restore','history','history-more','restore-version','context','method','defaults','method.close','method.item','method.save','method.retry','method.reload','method.history','method.restore'].map(name=>({kind:'local' as const,id:`ui.desk.${name}`,revision:'1'})),{kind:'local',id:'ui.desk.select',revision:'1',inputContractId:'quellight.selection.input'}];
