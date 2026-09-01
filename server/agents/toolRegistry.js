import {materialRows,codeFrom,num,safeText} from '../services/materialQuery.js';
import {getMaterialImportHistory} from '../services/materialHistory.js';
import {searchKnowledge} from '../services/knowledge.js';

const sapGlossary={
  material:'SAP Material Number / Material Code used to identify the material master record.',
  'material no':'SAP Material Number / Material Code used to identify the material master record.',
  unrestricted:'Unrestricted-use stock currently available for normal issue/use.',
  'purchase requisition':'PR document/request for procurement before a purchase order is created.',
  'purchase req':'PR document/request for procurement before a purchase order is created.',
  'open pr':'PR quantity still not converted/closed depending on the source report definition.',
  'open po':'PO quantity still open / not fully delivered depending on the source report definition.',
  'still to be delivered':'Open PO quantity still expected from the supplier.',
  'order quantity':'Requested/order quantity in the source report; confirm report context before treating it as open PR.',
  'name of supplier':'Supplier/Vendor name.',
  'purchasing document':'Purchase Order document number in typical purchasing reports.',
  'purchase requisition no':'Purchase Requisition document number.',
  plant:'SAP Plant organizational code.',
  'base unit of measure':'Material master base UOM.',
  'last issue date':'Most recent recorded goods issue date for the material in the report context.'
};

export const toolDefinitions=[
  {type:'function',function:{name:'get_material_profile',description:'Get the authoritative current profile for one spare by Material Code, including requirement, store, PR, PO, gap, locations and spare character.',parameters:{type:'object',properties:{material_code:{type:'string'}},required:['material_code'],additionalProperties:false}}},
  {type:'function',function:{name:'get_material_history',description:'Get dated Excel/SAP import-change history for one Material Code. This is not consumption/failure history unless an uploaded source explicitly says so.',parameters:{type:'object',properties:{material_code:{type:'string'},limit:{type:'integer',minimum:1,maximum:50}},required:['material_code'],additionalProperties:false}}},
  {type:'function',function:{name:'search_knowledge',description:'Search uploaded manuals, OEM catalogues, datasheets, repair reports and other indexed engineering evidence. Use before making a document-specific/OEM-specific claim.',parameters:{type:'object',properties:{query:{type:'string'},material_code:{type:'string'},equipment:{type:'string'},sub_equipment:{type:'string'},discipline:{type:'string'},limit:{type:'integer',minimum:1,maximum:12}},required:['query'],additionalProperties:false}}},
  {type:'function',function:{name:'find_pr_eligible_spares',description:'Find spares whose current stock plus open PR plus open PO does not cover the recorded required quantity.',parameters:{type:'object',properties:{equipment:{type:'string'},sub_equipment:{type:'string'},discipline:{type:'string'},limit:{type:'integer',minimum:1,maximum:50}},additionalProperties:false}}},
  {type:'function',function:{name:'find_zero_stock_spares',description:'Find zero-stock spares, optionally only those without an open PO.',parameters:{type:'object',properties:{without_po:{type:'boolean'},equipment:{type:'string'},sub_equipment:{type:'string'},limit:{type:'integer',minimum:1,maximum:50}},additionalProperties:false}}},
  {type:'function',function:{name:'search_spares',description:'Search spare master data by material code fragment, spare name, description, part number or vendor.',parameters:{type:'object',properties:{search:{type:'string'},equipment:{type:'string'},sub_equipment:{type:'string'},limit:{type:'integer',minimum:1,maximum:50}},required:['search'],additionalProperties:false}}},
  {type:'function',function:{name:'get_procurement_justification_facts',description:'Get authoritative facts needed to draft a procurement justification for one material.',parameters:{type:'object',properties:{material_code:{type:'string'}},required:['material_code'],additionalProperties:false}}},
  {type:'function',function:{name:'calculate_three_phase_motor_current',description:'Estimate three-phase motor line current from kW, voltage, power factor and efficiency.',parameters:{type:'object',properties:{power_kw:{type:'number',exclusiveMinimum:0},voltage_v:{type:'number',exclusiveMinimum:0},power_factor:{type:'number',exclusiveMinimum:0,maximum:1},efficiency:{type:'number',exclusiveMinimum:0,maximum:1}},required:['power_kw','voltage_v','power_factor','efficiency'],additionalProperties:false}}},
  {type:'function',function:{name:'calculate_synchronous_speed',description:'Calculate AC motor synchronous speed from frequency and pole count.',parameters:{type:'object',properties:{frequency_hz:{type:'number',exclusiveMinimum:0},poles:{type:'integer',minimum:2,maximum:24}},required:['frequency_hz','poles'],additionalProperties:false}}},
  {type:'function',function:{name:'calculate_shaft_surface_speed',description:'Calculate shaft/cylindrical surface speed from diameter and RPM.',parameters:{type:'object',properties:{diameter_mm:{type:'number',exclusiveMinimum:0},rpm:{type:'number',minimum:0}},required:['diameter_mm','rpm'],additionalProperties:false}}},
  {type:'function',function:{name:'calculate_bearing_l10_life',description:'Estimate basic bearing L10 life using C, P and RPM.',parameters:{type:'object',properties:{dynamic_capacity_kn:{type:'number',exclusiveMinimum:0},equivalent_load_kn:{type:'number',exclusiveMinimum:0},rpm:{type:'number',exclusiveMinimum:0},bearing_type:{type:'string',enum:['ball','roller']}},required:['dynamic_capacity_kn','equivalent_load_kn','rpm','bearing_type'],additionalProperties:false}}},
  {type:'function',function:{name:'sap_field_help',description:'Explain common SAP material, stock, PR and PO report fields used by spare planners.',parameters:{type:'object',properties:{field_name:{type:'string'}},required:['field_name'],additionalProperties:false}}}
];

export async function executeTool(name,args={},context={}){
  if(name==='get_material_profile')return {rows:await materialRows(context,{material_code:args.material_code,limit:5})};
  if(name==='get_material_history')return getMaterialImportHistory(args.material_code,args.limit||20);
  if(name==='search_knowledge')return {hits:await searchKnowledge(args.query,{...context,material_code:args.material_code||codeFrom(args.query),equipment:args.equipment||context.equipment,sub_equipment:args.sub_equipment||context.sub_equipment,discipline:args.discipline||context.discipline},args.limit||6)};
  if(name==='find_pr_eligible_spares')return {rows:await materialRows(context,{...args,pr_eligible:true,limit:args.limit||20})};
  if(name==='find_zero_stock_spares')return {rows:await materialRows(context,{...args,zero_stock:true,no_po:Boolean(args.without_po),limit:args.limit||20})};
  if(name==='search_spares')return {rows:await materialRows(context,{...args,search:args.search,limit:args.limit||20})};
  if(name==='get_procurement_justification_facts'){
    const rows=await materialRows(context,{material_code:args.material_code,limit:5});
    return {rows,missing_evidence:['consumption history','lead time','unit price','failure history']};
  }
  if(name==='calculate_three_phase_motor_current'){
    const kw=num(args.power_kw),v=num(args.voltage_v),pf=num(args.power_factor),eff=num(args.efficiency);
    if(!(kw>0&&v>0&&pf>0&&pf<=1&&eff>0&&eff<=1))return {error:'Invalid motor inputs'};
    return {line_current_a:kw*1000/(Math.sqrt(3)*v*pf*eff),formula:'I = P/(sqrt(3) × V × PF × efficiency)',note:'Estimate only; verify nameplate current and applicable protection/cable standards before design use.'};
  }
  if(name==='calculate_synchronous_speed'){
    const f=num(args.frequency_hz),p=num(args.poles);if(!(f>0&&p>=2))return {error:'Invalid frequency or pole count'};
    return {synchronous_speed_rpm:120*f/p,formula:'Ns = 120f/p',note:'Actual induction motor running speed is lower because of slip.'};
  }
  if(name==='calculate_shaft_surface_speed'){
    const d=num(args.diameter_mm),rpm=num(args.rpm);if(!(d>0&&rpm>=0))return {error:'Invalid diameter or RPM'};
    return {surface_speed_m_s:Math.PI*(d/1000)*rpm/60,formula:'v = pi × D × RPM / 60'};
  }
  if(name==='calculate_bearing_l10_life'){
    const C=num(args.dynamic_capacity_kn),P=num(args.equivalent_load_kn),rpm=num(args.rpm),power=args.bearing_type==='roller'?10/3:3;
    if(!(C>0&&P>0&&rpm>0))return {error:'Invalid bearing inputs'};
    const revolutions_million=Math.pow(C/P,power),hours=revolutions_million*1e6/(60*rpm);
    return {l10_million_revolutions:revolutions_million,l10_hours:hours,exponent:power,note:'Basic rating life estimate only. Actual life depends on lubrication, contamination, alignment, temperature, load spectrum and mounting.'};
  }
  if(name==='sap_field_help'){
    const raw=safeText(args.field_name,120).toLowerCase(),key=Object.keys(sapGlossary).find(k=>raw===k||raw.includes(k));
    return {field:args.field_name,meaning:key?sapGlossary[key]:'No exact local glossary entry. Ask SAP report owner to confirm this field definition before using it in calculations.'};
  }
  return {error:`Unknown tool: ${name}`};
}
