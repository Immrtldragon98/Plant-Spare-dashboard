export function evaluateProcurementCoverage({required_qty=0,store_qty=0,pr_qty=0,po_qty=0}){
  const required=Number(required_qty||0),store=Number(store_qty||0),pr=Number(pr_qty||0),po=Number(po_qty||0);
  const pipeline=store+pr+po,ideal=Math.max(required-pipeline,0),critical=required>0&&store<required,eligible=critical&&ideal>0,ratio=required>0?ideal/required:0;
  const priority=!eligible?'Covered':store<=0?'Urgent':ratio>=0.5?'High':'Medium';
  const reason=eligible?`Uncovered gap ${ideal} after Store + PR + PO`:(critical?'Low stock, but existing PR/PO covers the current requirement':'Stock meets current requirement');
  return {required_qty:required,store_qty:store,pr_qty:pr,po_qty:po,pipeline_qty:pipeline,ideal_pr_qty:ideal,critical,pr_eligible:eligible,rule_priority:priority,rule_reason:reason};
}
