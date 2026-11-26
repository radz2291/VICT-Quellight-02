import type { UiNode, UiExpression, UiLocalStateDecl, UiStyleDeclaration } from '@victframework/ui';
import type { ApplicationDefinitionV3 } from '@victframework/sdk';
import { rheaNativePatterns } from '@victframework/ui-svelte/rhea';

const l=(value:string|number|boolean):UiExpression=>({type:'literal',value}), r=(path:string):UiExpression=>({type:'ref',path});
const st=(property:string,value:string):UiStyleDeclaration=>({property,value:{type:'text',value}});
const el=(id:string,tag:string,children:string[],classes:string[]=[]):Extract<UiNode,{kind:'element'}>=>({kind:'element',id,tag,children,classes});
const txt=(id:string,value:string,ref=false):UiNode=>({kind:'text',id,content:ref?{type:'expression',expression:r(value)}:{type:'literal',value}});
const cond=(id:string,when:string,children:string[]):UiNode=>({kind:'conditional',id,branches:[{when,children}]});
const quiet=[st('background','transparent'),st('color','var(--vict-color-textMuted)'),st('border-color','transparent'),st('font-size','13px'),st('font-weight','400'),st('min-height','36px'),st('padding','6px 10px')];
const primary = [st('min-height','44px'),st('padding','6px var(--ql-desk-action-padding, 14px)'),st('font-size','var(--ql-desk-action-font, 13px)'),st('white-space','nowrap')];
const deskIcon=(id:string,name:string):UiNode=>({kind:'component',id,definitionId:'vict.media.icon',revision:'1',props:{pack:l('lucide'),name:l(name),revision:l('1.27.0'),size:l(17),decorative:l(true)}});
function button(id:string,label:string,actionId:string,input?:Record<string,UiExpression>,disabled='pending'):Extract<UiNode,{kind:'component'}> {
  return {kind:'component',id,definitionId:'vict.catalog.button',revision:'1',props:{label:l(label),disabled:r(`view.${disabled}`)},outputs:{press:{invokeAction:{actionId,...(input?{input}:{})}}},localStyle:quiet};
}
function copy(id:string,value:string,ref=false):Record<string,UiNode>{return {[id]:el(id,'p',[`${id}-text`],['ql-muted']),[`${id}-text`]:txt(`${id}-text`,value,ref)};}
function field(id:string,key:string,label:string,mode:'input'|'textarea'|'native-select'='input',options?:string,disabled='deskReadOnly'):Record<string,UiNode>{
  const fragment=rheaNativePatterns.find(p=>p.id===mode)!.create(id),nodes=Object.fromEntries(fragment.nodes.map(n=>[n.id,n])) as Record<string,UiNode>;
  const control=nodes[`${id}-control`] as Extract<UiNode,{kind:'element'}>;
  nodes[id]=el(id,'div',[`${id}-label`,`${id}-control`],['vict-rhea','vict-rhea-field','ql-desk-field']);nodes[`${id}-label-text`]=txt(`${id}-label-text`,label);
  nodes[`${id}-control`]={...control,children:options?[`${id}-options`]:[],attributes:{id:`${id}-control`,name:key,value:r(`state.${key}`),disabled:r(`view.${disabled}`),...(mode==='textarea'?{rows:'12'}:mode==='input'?{type:key==='dSearch'?'search':'text'}:{}),...(key==='dSearch'?{placeholder:'Search Desk',autocomplete:'off'}:{})},interactions:[{on:'change',action:'setState',key,value:r(`state.${key}`)}]};
  for(const suffix of ['help','help-text','option-first','option-second','first-text','second-text'])delete nodes[`${id}-${suffix}`];
  if(options){nodes[`${id}-options`]={kind:'repeat',id:`${id}-options`,collection:r(`view.${options}`),key:r('repeat.option.value'),itemName:'option',templateRoot:`${id}-option`};nodes[`${id}-option`]={kind:'element',id:`${id}-option`,tag:'option',children:[`${id}-option-label`],attributes:{value:r('repeat.option.value')}};nodes[`${id}-option-label`]=txt(`${id}-option-label`,'repeat.option.label',true);}
  return nodes;
}
function disclosure(id:string,label:string,children:string[]):Record<string,UiNode>{return {
  [id]:{kind:'component',id,definitionId:'vict.catalog.collapsible',revision:'1',classes:['ql-memory-disclosure'],props:{label:l(label),open:r(`state.${id}Open`)},outputs:{openChange:{setState:{key:`${id}Open`}}},slots:{trigger:{name:'trigger',children:[`${id}-label`,`${id}-chevron`]},content:{name:'content',children}},partStyles:{trigger:{localStyle:[...quiet,st('min-height','var(--ql-disclosure-height)'),st('width','100%'),st('justify-content','space-between'),st('padding','6px 0')]},content:{localStyle:[st('padding','8px 0')]}}},
  [`${id}-label`]:txt(`${id}-label`,label),[`${id}-chevron`]:{kind:'component',id:`${id}-chevron`,definitionId:'vict.media.icon',revision:'1',props:{pack:l('lucide'),name:l('chevron-down'),revision:l('1.27.0'),size:l(15),decorative:l(true)}}};}
function confirm(id:string,label:string,title:string,description:string,actionId:string,disabled='deskCannotMutate'):Record<string,UiNode>{return {
  [id]:{kind:'component',id,definitionId:'vict.catalog.alert-dialog',revision:'1',props:{open:r(`state.${id}Open`),label:l(label),title:l(title),description:l(description),confirmLabel:l(label),cancelLabel:l('Cancel'),disabled:r(`view.${disabled}`)},slots:{body:{name:'body',children:[`${id}-body`]}},outputs:{openChange:{setState:{key:`${id}Open`}},confirm:{invokeAction:{actionId}}},partStyles:{trigger:{localStyle:quiet}}},[`${id}-body`]:el(`${id}-body`,'div',[])};}

export const deskNodes:Record<string,UiNode>={
  deskContextLoad:button('deskContextLoad','Show Desk context','ui.desk.context',undefined,'deskCannotContext'),
  ...copy('deskContextCopy','view.deskContextText',true),
  deskPage:{...el('deskPage','section',['deskSearchWrap','deskStatus','deskLayout'],['ql-desk-page']),attributes:{'data-detail':r('view.deskHasDetail')}},
  deskHeaderTools:cond('deskHeaderTools','deskBrowse',['deskHeaderActions']),
  deskHeaderActions:{...el('deskHeaderActions','div',['deskSearchToggle','deskNewWrap','deskMenu'],['ql-desk-header-actions']),attributes:{'data-search-open':r('state.dSearchOpen')}},
  deskSearchToggle:{kind:'component',id:'deskSearchToggle',definitionId:'vict.pattern.action-button',revision:'1',classes:['ql-desk-icon-action'],
    props:{label:l('Search Desk'),iconOnly:l(true)},slots:{icon:{name:'icon',children:['deskSearchToggleIcon']}},
    outputs:{activate:{invokeAction:{actionId:'ui.desk.search.toggle'}}}},
  deskSearchToggleIcon:deskIcon('deskSearchToggleIcon','search'),
  deskNewWrap:cond('deskNewWrap','deskShowNew',['deskNew']),
  deskNew:{kind:'component',id:'deskNew',definitionId:'vict.pattern.action-button',revision:'1',classes:['ql-desk-icon-action'],
    props:{label:l('New item'),iconOnly:l(true),disabled:r('view.deskCannotCreate')},slots:{icon:{name:'icon',children:['deskNewIcon']}},
    outputs:{activate:{invokeAction:{actionId:'ui.desk.new'}}}},
  deskNewIcon:deskIcon('deskNewIcon','plus'),
  deskMenu:{kind:'component',id:'deskMenu',definitionId:'vict.catalog.dropdown-menu',revision:'1',
    props:{label:l('Desk options'),open:r('state.moreOpen'),disabled:r('view.pending')},
    outputs:{openChange:{setState:{key:'moreOpen'}}},
    slots:{trigger:{name:'trigger',children:['deskMenuIcon','deskMenuName']},items:{name:'items',children:['deskAttentionGroup','deskMenuSeparator','deskArchived']}}},
  deskMenuIcon:el('deskMenuIcon','span',['deskMenuGlyph'],['ql-vertical-dots']),
  deskMenuGlyph:deskIcon('deskMenuGlyph','more-horizontal'),
  deskMenuName:el('deskMenuName','span',['deskMenuLabel'],['ql-visually-hidden']),
  deskMenuLabel:txt('deskMenuLabel','Desk options'),
  deskAttentionGroup:{kind:'component',id:'deskAttentionGroup',definitionId:'vict.catalog.dropdown-menu.group',revision:'1',
    props:{label:l('Attention')},slots:{items:{name:'items',children:['deskAttentionRadio']}}},
  deskAttentionRadio:{kind:'component',id:'deskAttentionRadio',definitionId:'vict.catalog.dropdown-menu.radio-group',revision:'1',
    props:{value:r('state.dFilter')},outputs:{valueChange:{setState:{key:'dFilter'}}},slots:{items:{name:'items',children:['deskAttentionChoices']}}},
  deskAttentionChoices:{kind:'repeat',id:'deskAttentionChoices',collection:r('view.deskFilterOptions'),key:r('repeat.filter.value'),itemName:'filter',templateRoot:'deskAttentionChoice'},
  deskAttentionChoice:{kind:'component',id:'deskAttentionChoice',definitionId:'vict.catalog.dropdown-menu.radio-item',revision:'1',
    props:{label:r('repeat.filter.label'),value:r('repeat.filter.value'),closeOnSelect:l(true)}},
  deskMenuSeparator:{kind:'component',id:'deskMenuSeparator',definitionId:'vict.catalog.dropdown-menu.separator',revision:'1'},
  deskArchived:{kind:'component',id:'deskArchived',definitionId:'vict.catalog.dropdown-menu.checkbox-item',revision:'1',
    props:{label:l('Archived'),checked:r('state.dArchived'),closeOnSelect:l(true)},outputs:{checkedChange:{setState:{key:'dArchived'}}}},
  deskMethodPage:el('deskMethodPage','section',['deskMethodContent'],['ql-room-page']),
  deskMethodContent:el('deskMethodContent','div',['deskMethodIntro','deskMethodStatus','deskMethodSavedWrap','deskMethodLoadingWrap','deskMethodSettingsWrap'],['ql-method-page']),
  ...copy('deskMethodIntro','view.deskMethodIntro',true),...copy('deskMethodStatus','view.deskMethodStatus',true),
  deskMethodSavedWrap:cond('deskMethodSavedWrap','deskMethodRoom',['deskMethodDocument','deskMethodActivity']),
  deskMethodDocument:el('deskMethodDocument','article',['deskMethodSaved','deskMethodItemWrap'],['ql-method-document']),
  deskMethodSaved:{kind:'component',id:'deskMethodSaved',definitionId:'vict.ai.markdown',revision:'1',props:{text:r('view.deskMethodText')},classes:['ql-desk-markdown']},
  deskMethodItemWrap:cond('deskMethodItemWrap','deskHasMethodItem',['deskMethodEdit']),deskMethodEdit:button('deskMethodEdit','Edit method and view versions','ui.desk.method.item'),
  ...disclosure('deskMethodActivity','Method activity',['deskMethodActivityCopy']),...copy('deskMethodActivityCopy','view.deskMethodActivityText',true),
  deskMethodLoadingWrap:cond('deskMethodLoadingWrap','deskMethodLoading',['deskMethodLoadingCopy']),...copy('deskMethodLoadingCopy','Opening saved method settings…'),
  deskMethodSettingsWrap:cond('deskMethodSettingsWrap','deskMethodReady',['deskMethodForm']),
  deskMethodForm:el('deskMethodForm','section',['deskMethodSettingsTitle','deskMethodLearning','deskMethodEffective','deskMethodPromptModeWrap','deskMethodPromptWrap','deskMethodButtons','deskMethodRetryWrap','deskMethodConflictWrap','deskMethodHistory'],['ql-form','ql-method-settings']),
  deskMethodSettingsTitle:el('deskMethodSettingsTitle','h2',['deskMethodSettingsLabel']),
  deskMethodSettingsLabel:txt('deskMethodSettingsLabel','Learning settings'),
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
  deskList:el('deskList','section',['deskFilterSummary','deskEmpty','deskGallery','deskMoreWrap'],['ql-desk-list']),
  deskSearchWrap:cond('deskSearchWrap','deskSearchOpen',['deskSearchPanel']),
  deskSearchPanel:el('deskSearchPanel','div',['deskSearchRow'],['ql-desk-search-panel']),
  deskFilterSummary:{...el('deskFilterSummary','p',['deskFilterSummaryText'],['ql-desk-filter-summary']),attributes:{role:'status'}},
  deskFilterSummaryText:txt('deskFilterSummaryText','view.deskFilterSummary',true),
  deskSearchRow:{...el('deskSearchRow','form',['deskSearchIcon','deskSearch'],['ql-desk-search-row']),
    interactions:[{on:'submit',action:'invokeAction',actionId:'ui.desk.search'}]},
  deskSearchIcon:deskIcon('deskSearchIcon','search'),
  ...field('deskSearch','dSearch','Search Desk','input',undefined,'pending'),
  deskEmpty:cond('deskEmpty','deskEmpty',['deskEmptyCopy']),...copy('deskEmptyCopy','view.deskEmptyText',true),
  deskGallery:el('deskGallery','div',['deskRows'],['ql-desk-gallery']),
  deskRows:{kind:'repeat',id:'deskRows',collection:r('view.deskItems'),key:r('repeat.item.id'),itemName:'item',templateRoot:'deskRow'},
  deskRow:{kind:'component',id:'deskRow',definitionId:'vict.pattern.action-button',revision:'1',classes:['ql-desk-card'],
    props:{label:r('repeat.item.title'),value:r('repeat.item.id'),disabled:r('view.pending')},
    outputs:{activate:{invokeAction:{actionId:'ui.desk.select',input:{id:r('$output')}}}},
    slots:{trailingIcon:{name:'trailingIcon',children:['deskCardContent']}}},
  deskCardContent:el('deskCardContent','span',['deskCardPreview','deskCardLabels'],['ql-desk-card-content']),
  deskCardPreview:el('deskCardPreview','span',['deskCardPreviewText'],['ql-desk-card-preview']),
  deskCardPreviewText:txt('deskCardPreviewText','repeat.item.preview',true),
  deskCardLabels:{...el('deskCardLabels','span',['deskCardAttention','deskCardMethod'],['ql-desk-card-labels']),attributes:{'data-method':r('repeat.item.isMethod')}},
  deskCardAttention:el('deskCardAttention','span',['deskCardAttentionText'],['ql-desk-card-meta']),
  deskCardAttentionText:txt('deskCardAttentionText','repeat.item.attention',true),
  deskCardMethod:el('deskCardMethod','span',['deskCardMethodText'],['ql-desk-card-method']),
  deskCardMethodText:txt('deskCardMethodText','Room method'),
  deskMoreWrap:cond('deskMoreWrap','deskHasMore',['deskMore']),deskMore:button('deskMore','More items','ui.desk.more'),
  deskDetailArea:el('deskDetailArea','section',['deskDetailChoice'],['ql-desk-detail']),
  deskDetailChoice:{kind:'conditional',id:'deskDetailChoice',branches:[{when:'deskLoading',children:['deskLoadingCopy']},{when:'deskHasDetail',children:['deskDetail']},{when:'deskOpen',children:['deskChoose']}]},
  ...copy('deskLoadingCopy','Opening saved item…'),...copy('deskChoose','Choose an item, or start a new one. Notes, plans and references live here.'),
  deskDetail:el('deskDetail','div',['deskDetailScroll','deskItemActions'],['ql-desk-detail-content']),
  deskDetailScroll:el('deskDetailScroll','div',['deskRevision','deskConflictWrap','deskUncertainWrap','deskEditing','deskPreviewWrap','deskHistoryWrap'],['ql-desk-detail-scroll']),
  ...copy('deskRevision','view.deskRevisionLabel',true),
  deskConflictWrap:cond('deskConflictWrap','deskConflict',['deskConflictNotice']),
  deskConflictNotice:{...el('deskConflictNotice','div',['deskConflictCopy','deskReload'],['ql-desk-recovery']),attributes:{role:'alert'}},
  ...copy('deskConflictCopy','This item changed elsewhere. Your draft is kept on this device. Review the saved version before replacing it.'),
  ...confirm('deskReload','Reload saved version','Replace this local draft?','The latest saved item will replace this device’s unsaved draft.','ui.desk.reload','pending'),
  deskUncertainWrap:cond('deskUncertainWrap','deskUncertain',['deskUncertainNotice']),
  deskUncertainNotice:{...el('deskUncertainNotice','div',['deskUncertainCopy','deskRetry'],['ql-desk-recovery']),attributes:{role:'alert'}},
  ...copy('deskUncertainCopy','The save response was interrupted. Retry this same change to check its recorded result. Your draft is kept.'),deskRetry:button('deskRetry','Retry change','ui.desk.retry'),
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
  deskSaveWrap:cond('deskSaveWrap','deskCanEdit',['deskSave']),
  deskSave:{...button('deskSave','Save item','ui.desk.save',undefined,'deskCannotSave'),localStyle:primary},
  deskPreviewToggle:{...button('deskPreviewToggle','','ui.desk.preview') as Extract<UiNode,{kind:'component'}>,props:{label:r('view.deskPreviewLabel'),disabled:r('view.deskArchivedItem')}},
  deskArchiveWrap:cond('deskArchiveWrap','deskCanArchive',['deskArchive']),...confirm('deskArchive','Archive item','Archive this item?','It will leave the active Desk. Its text and versions stay available in Archived.','ui.desk.archive'),
  deskRestoreWrap:cond('deskRestoreWrap','deskArchivedItem',['deskRestore']),deskRestore:button('deskRestore','Restore item','ui.desk.restore',undefined,'deskCannotMutate'),
  deskHistoryWrap:cond('deskHistoryWrap','deskExisting',['deskHistory']),...disclosure('deskHistory','Saved versions',['deskHistorySelect','deskHistoryMoreWrap','deskHistoryShow','deskHistoryText','deskRestoreVersion']),
  deskHistoryMoreWrap:cond('deskHistoryMoreWrap','deskMoreVersions',['deskHistoryMore']),deskHistoryMore:button('deskHistoryMore','Load older versions','ui.desk.history-more'),
  ...field('deskHistorySelect','dHistory','Version','native-select','deskHistoryOptions','pending'),deskHistoryShow:button('deskHistoryShow','Show version','ui.desk.history'),
  ...copy('deskHistoryText','view.deskHistoryText',true),...confirm('deskRestoreVersion','Restore this version','Restore this saved version?','This creates a new revision. Your existing saved versions remain available. Any local draft will be replaced.','ui.desk.restore-version','deskCannotRestoreVersion')
};
export const deskLocalState:Record<string,UiLocalStateDecl>=Object.fromEntries(Object.entries({dTitle:'',dBody:'',dKind:'',dStatus:'',dAttention:'within-reach',dSearch:'',dSearchOpen:false,dFilter:'all',dArchived:false,dHistory:'',dPreview:false,deskMetadataOpen:false,deskHistoryOpen:false,deskArchiveOpen:false,deskReloadOpen:false,deskRestoreVersionOpen:false,dMethodEnabled:'inherit',dMethodPromptMode:'inherit',dMethodPrompt:'',dMethodVersion:'',deskMethodActivityOpen:false,deskMethodHistoryOpen:false,deskMethodReloadOpen:false,deskMethodRestoreOpen:false}).map(([key,initial])=>[key,{key,type:typeof initial as 'string'|'boolean',initial}]));
const flags=['deskOpen','deskBrowse','deskSearchOpen','deskShowNew','deskHasDetail','deskLoading','deskEmpty','deskHasMore','deskMoreVersions','deskConflict','deskUncertain','deskEditing','deskPreview','deskCanEdit','deskCanArchive','deskArchivedItem','deskExisting','deskReadOnly','deskCannotSave','deskCannotMutate','deskCannotCreate','deskCannotRestoreVersion','deskCannotContext','deskMethodOpen','deskMethodRoom','deskHasMethodItem','deskMethodLoading','deskMethodReady','deskMethodCustom','deskMethodReadOnly','deskMethodCannotSave','deskMethodUncertain','deskMethodConflict','deskMethodCannotRestore'] as const;
export const deskConditions=Object.fromEntries(flags.map(id=>[id,{id,kind:'localState' as const,when:r(`view.${id}`)}]));
const textViews=['deskContextText','deskStatus','deskFilterSummary','deskEmptyText','deskRevisionLabel','deskPreviewLabel','deskHistoryText','deskMethodIntro','deskMethodStatus','deskMethodText','deskMethodActivityText','deskMethodEffectiveText','deskMethodHistoryText'];
const optionViews=['deskAttentionOptions','deskFilterOptions','deskHistoryOptions','deskMethodEnabledOptions','deskMethodPromptOptions','deskMethodHistoryOptions'];
export const deskViewFields={...Object.fromEntries(flags.map(id=>[id,'boolean' as const])),...Object.fromEntries(textViews.map(id=>[id,'string' as const])),deskItems:'array','deskItems.id':'string','deskItems.title':'string','deskItems.preview':'string','deskItems.attention':'string','deskItems.isMethod':'boolean',...Object.fromEntries(optionViews.flatMap(key=>[[key,'array'],[`${key}.value`,'string'],[`${key}.label`,'string']]))} as const;
export const deskInitialView={...Object.fromEntries(flags.map(id=>[id,false])),...Object.fromEntries(textViews.map(id=>[id,''])),...Object.fromEntries(optionViews.map(id=>[id,[]])),deskItems:[]};
export const deskInterfaceActions:ApplicationDefinitionV3['actions']=[...['open','close','new','list','search','search.toggle','more','reload','retry','save','preview','archive','restore','history','history-more','restore-version','context','method','defaults','method.close','method.item','method.save','method.retry','method.reload','method.history','method.restore'].map(name=>({kind:'local' as const,id:`ui.desk.${name}`,revision:'1'})),{kind:'local',id:'ui.desk.select',revision:'1',inputContractId:'quellight.selection.input'}];
