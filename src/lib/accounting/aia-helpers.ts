import { SupabaseClient } from '@supabase/supabase-js';

export const ACCOUNTANT_NAMES = [
  'Avery',
  'Jaci',
  'Laurie',
  'Marge',
  'Meredith',
] as const;

export interface G703Line {
  sovItemId: string;
  itemNumber: string;
  description: string;
  source: 'contract' | 'change_order';
  scheduledValue: number;
  previousCompleted: number;
  thisPeriod: number;
  storedMaterials: number;
  totalCompletedAndStored: number;
  percentComplete: number;
  balanceToFinish: number;
}

export interface G702Summary {
  originalContractSum: number;
  netChangeOrders: number;
  contractSumToDate: number;
  totalCompletedWork: number;
  totalStoredMaterials: number;
  totalCompletedAndStored: number;
  retainageOnCompleted: number;
  retainageOnStored: number;
  retainageAmount: number;
  totalEarnedLessRetainage: number;
  lessPreviousCertificates: number;
  currentPaymentDue: number;
  lines: G703Line[];
}

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function calculateG702AndG703(params: {
  lines: G703Line[];
  completedRetainagePercent: number;
  storedRetainagePercent: number;
  lessPreviousCertificates: number;
  isRetainageRelease?: boolean;
}): G702Summary {
  const completedRetRate = Math.max(0, Number(params.completedRetainagePercent) || 0) / 100;
  const storedRetRate = Math.max(0, Number(params.storedRetainagePercent) || 0) / 100;

  let originalContractSum = 0;
  let netChangeOrders = 0;
  let totalCompletedWork = 0;
  let totalStoredMaterials = 0;

  const normalizedLines: G703Line[] = params.lines.map((l) => {
    const scheduledValue = round2(l.scheduledValue);
    const previousCompleted = round2(l.previousCompleted);
    const thisPeriod = round2(l.thisPeriod);
    const storedMaterials = round2(l.storedMaterials);
    const completedWork = round2(previousCompleted + thisPeriod);
    const totalCompletedAndStored = round2(completedWork + storedMaterials);
    const percentComplete =
      scheduledValue !== 0
        ? Math.round((totalCompletedAndStored / scheduledValue) * 1000) / 10
        : 0;
    const balanceToFinish = round2(scheduledValue - totalCompletedAndStored);

    if (l.source === 'change_order') {
      netChangeOrders += scheduledValue;
    } else {
      originalContractSum += scheduledValue;
    }

    totalCompletedWork += completedWork;
    totalStoredMaterials += storedMaterials;

    return {
      ...l,
      scheduledValue,
      previousCompleted,
      thisPeriod,
      storedMaterials,
      totalCompletedAndStored,
      percentComplete,
      balanceToFinish,
    };
  });

  originalContractSum = round2(originalContractSum);
  netChangeOrders = round2(netChangeOrders);
  const contractSumToDate = round2(originalContractSum + netChangeOrders);
  totalCompletedWork = round2(totalCompletedWork);
  totalStoredMaterials = round2(totalStoredMaterials);
  const totalCompletedAndStored = round2(totalCompletedWork + totalStoredMaterials);

  const retainageOnCompleted = params.isRetainageRelease
    ? 0
    : round2(totalCompletedWork * completedRetRate);
  const retainageOnStored = params.isRetainageRelease
    ? 0
    : round2(totalStoredMaterials * storedRetRate);
  const retainageAmount = round2(retainageOnCompleted + retainageOnStored);
  const totalEarnedLessRetainage = round2(totalCompletedAndStored - retainageAmount);
  const lessPreviousCertificates = round2(params.lessPreviousCertificates);
  const currentPaymentDue = round2(totalEarnedLessRetainage - lessPreviousCertificates);

  return {
    originalContractSum,
    netChangeOrders,
    contractSumToDate,
    totalCompletedWork,
    totalStoredMaterials,
    totalCompletedAndStored,
    retainageOnCompleted,
    retainageOnStored,
    retainageAmount,
    totalEarnedLessRetainage,
    lessPreviousCertificates,
    currentPaymentDue,
    lines: normalizedLines,
  };
}

export async function syncChangeOrderToSov(
  supabase: SupabaseClient,
  jobId: string,
  co: {
    id: string;
    co_number: string;
    title: string;
    type: string;
    amount: number;
    status: string;
  }
): Promise<void> {
  const shouldBeInSov = co.status === 'approved' || co.status === 'billed';

  if (!shouldBeInSov) {
    await supabase.from('job_sov_items').delete().eq('change_order_id', co.id);
    return;
  }

  const signedAmount =
    co.type === 'deduction' ? -Math.abs(Number(co.amount) || 0) : Math.abs(Number(co.amount) || 0);

  const { data: existing } = await supabase
    .from('job_sov_items')
    .select('id')
    .eq('change_order_id', co.id)
    .maybeSingle();

  const payload = {
    job_id: jobId,
    item_number: co.co_number || 'CO',
    description: `${co.co_number}: ${co.title}`,
    scheduled_value: round2(signedAmount),
    source: 'change_order',
    change_order_id: co.id,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    await supabase.from('job_sov_items').update(payload).eq('id', existing.id);
    return;
  }

  const { data: currentSov } = await supabase
    .from('job_sov_items')
    .select('sort_order')
    .eq('job_id', jobId)
    .order('sort_order', { ascending: false })
    .limit(1);

  const nextSort = (currentSov?.[0]?.sort_order ?? 0) + 1;
  await supabase.from('job_sov_items').insert({
    ...payload,
    sort_order: nextSort,
  });
}
