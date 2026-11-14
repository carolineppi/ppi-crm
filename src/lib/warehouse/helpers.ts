export const PRESET_STAGING_BAYS = [
  'Receiving Dock',
  'Bay A',
  'Bay B',
  'Bay C',
  'Rack 1',
  'Rack 2',
  'Rack 3',
  'Rack 4',
  'Will Call',
  'Direct to Site',
] as const;

export const INVENTORY_CATEGORIES = [
  'Hardware',
  'Toilet Accessories',
  'Partitions',
  'Fire Protection',
  'Fasteners',
  'Lockers',
  'Other',
] as const;

export type WarehouseJobStatus =
  | 'awaiting_materials'
  | 'partial_received'
  | 'staged_ready'
  | 'loaded_out'
  | 'delivered_to_site';

export const WAREHOUSE_STATUS_META: Record<
  WarehouseJobStatus,
  { label: string; badgeClass: string }
> = {
  awaiting_materials: {
    label: 'Awaiting Materials',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
  },
  partial_received: {
    label: 'Partial Received',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  staged_ready: {
    label: 'Staged & Ready',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  loaded_out: {
    label: 'Loaded / Dispatched',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  delivered_to_site: {
    label: 'Delivered to Site',
    badgeClass: 'bg-teal-100 text-teal-800 border-teal-300',
  },
};

export function getWarehouseStatusMeta(status?: string | null) {
  const key = (status || 'awaiting_materials') as WarehouseJobStatus;
  return (
    WAREHOUSE_STATUS_META[key] || {
      label: status || 'Awaiting Materials',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    }
  );
}

/**
 * Recompute a job's warehouse_status from its Purchase Orders.
 * Preserves 'loaded_out' / 'delivered_to_site' if already dispatched unless forced.
 */
export function deriveJobWarehouseStatus(
  pos: Array<{ status?: string | null; has_damage_or_shortage?: boolean | null }>,
  currentStatus?: string | null
): WarehouseJobStatus {
  if (currentStatus === 'loaded_out' || currentStatus === 'delivered_to_site') {
    return currentStatus;
  }
  const activePos = pos.filter((p) => p.status !== 'cancelled');
  if (activePos.length === 0) return 'awaiting_materials';

  const allReceived = activePos.every(
    (p) => p.status === 'received' && !p.has_damage_or_shortage
  );
  if (allReceived) return 'staged_ready';

  const anyReceivedOrPartial = activePos.some(
    (p) => p.status === 'received' || p.status === 'partial'
  );
  if (anyReceivedOrPartial) return 'partial_received';

  return 'awaiting_materials';
}
