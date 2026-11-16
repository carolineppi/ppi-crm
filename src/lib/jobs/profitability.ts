export interface JobProfitabilitySummary {
  baseContract: number;
  approvedAdditions: number;
  approvedDeductions: number;
  adjustedContract: number;
  estimatedMaterialTotal: number;
  committedPoTotal: number;
  poEstimateBaselineTotal: number;
  poVariance: number;
  costToCompleteEstimate: number;
  projectedTotalCost: number;
  projectedGrossProfit: number;
  projectedMarginPercent: number | null;
  billedToDate: number;
  paidToDate: number;
  remainingContractToBill: number;
  billedPercent: number;
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function computeJobProfitability(params: {
  job: any;
  purchaseOrders?: any[];
  changeOrders?: any[];
  payApplications?: any[];
}): JobProfitabilitySummary {
  const { job, purchaseOrders = [], changeOrders = [], payApplications = [] } = params;

  const baseContract = round2(Number(job?.quote_amount) || 0);

  let approvedAdditions = 0;
  let approvedDeductions = 0;
  for (const co of changeOrders) {
    if (co && (co.status === 'approved' || co.status === 'billed')) {
      const amt = Math.abs(Number(co.amount) || 0);
      if (co.type === 'deduction') approvedDeductions += amt;
      else approvedAdditions += amt;
    }
  }
  approvedAdditions = round2(approvedAdditions);
  approvedDeductions = round2(approvedDeductions);
  const adjustedContract = round2(baseContract + approvedAdditions - approvedDeductions);

  const lineItems = Array.isArray(job?.line_items) ? job.line_items : [];
  const estimatedMaterialTotal = round2(
    lineItems.reduce((sum: number, li: any) => {
      if (li?.isAddon && li?.addonStatus !== 'approved') return sum;
      const qty = Math.max(1, Number(li?.quantity) || 1);
      const price = Number(li?.unitPrice) || 0;
      return sum + qty * price;
    }, 0)
  );

  let committedPoTotal = 0;
  let poEstimateBaselineTotal = 0;
  for (const po of purchaseOrders) {
    if (!po || po.status === 'cancelled') continue;
    const poTotal = Number(po.total_cost) || 0;
    committedPoTotal += poTotal;

    const poItems = Array.isArray(po.items) ? po.items : [];
    if (poItems.length > 0) {
      for (const it of poItems) {
        const qty = Math.max(1, Number(it?.quantity) || 1);
        const est =
          it?.estimatedUnitCost !== null && it?.estimatedUnitCost !== undefined
            ? Number(it.estimatedUnitCost) || 0
            : Number(it?.unitCost) || 0;
        poEstimateBaselineTotal += qty * est;
      }
    } else {
      poEstimateBaselineTotal += poTotal;
    }
  }
  committedPoTotal = round2(committedPoTotal);
  poEstimateBaselineTotal = round2(poEstimateBaselineTotal);
  const poVariance = round2(committedPoTotal - poEstimateBaselineTotal);

  const costToCompleteEstimate = round2(
    Math.max(0, estimatedMaterialTotal - poEstimateBaselineTotal)
  );
  const projectedTotalCost = round2(committedPoTotal + costToCompleteEstimate);
  const projectedGrossProfit = round2(adjustedContract - projectedTotalCost);
  const projectedMarginPercent =
    adjustedContract > 0
      ? Math.round((projectedGrossProfit / adjustedContract) * 1000) / 10
      : null;

  let billedToDate = 0;
  let paidToDate = 0;
  for (const app of payApplications) {
    if (!app) continue;
    const due = Number(app.current_payment_due) || 0;
    if (app.status === 'submitted' || app.status === 'paid') {
      billedToDate += due;
    }
    if (app.status === 'paid') {
      paidToDate += due;
    }
  }
  billedToDate = round2(billedToDate);
  paidToDate = round2(paidToDate);
  const remainingContractToBill = round2(Math.max(0, adjustedContract - billedToDate));
  const billedPercent =
    adjustedContract > 0
      ? Math.min(100, Math.round((billedToDate / adjustedContract) * 1000) / 10)
      : 0;

  return {
    baseContract,
    approvedAdditions,
    approvedDeductions,
    adjustedContract,
    estimatedMaterialTotal,
    committedPoTotal,
    poEstimateBaselineTotal,
    poVariance,
    costToCompleteEstimate,
    projectedTotalCost,
    projectedGrossProfit,
    projectedMarginPercent,
    billedToDate,
    paidToDate,
    remainingContractToBill,
    billedPercent,
  };
}
