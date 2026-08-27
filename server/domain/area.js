export function canonicalArea(value=''){
  const v=String(value||'').trim();
  if(v==='CH2_WRM')return 'WRM';
  if(v==='CH2_ICM')return 'ICM';
  return v;
}

export function areaVariants(value=''){
  const v=canonicalArea(value);
  if(v==='WRM')return ['WRM','CH2_WRM'];
  if(v==='ICM')return ['ICM','CH2_ICM'];
  return v?[v]:[];
}
