export interface LineItemOrderStatus {
  orderedQty: number;
  requiredQty: number;
  status: 'ordered' | 'partial' | 'pending';
  poNumbers: string[];
}

function norm(val: unknown): string {
  return String(val ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function poItemMatchesLineItem(poItem: any, li: any): boolean {
  if (!poItem || !li) return false;

  if (poItem.sourceLineItemId && li.id && String(poItem.sourceLineItemId) === String(li.id)) {
    return true;
  }

  if (
    poItem.sourceLineNumber &&
    li.lineNumber &&
    Number(poItem.sourceLineNumber) === Number(li.lineNumber)
  ) {
    return true;
  }

  const liSku = norm(li.sku);
  const poSku = norm(poItem.sku);
  const liDesc = norm(li.description);
  const poDesc = norm(poItem.description);

  if (liSku && poSku && liSku === poSku) {
    if (!liDesc || !poDesc || liDesc === poDesc) {
      return true;
    }
  }

  if (liDesc && poDesc && liDesc === poDesc) {
    return true;
  }

  return false;
}

/**
 * Computes per-line-item PO ordering status across all non-cancelled Purchase Orders for a job.
 */
export function getJobLineItemsOrderStatus(
  lineItems: any[] | null | undefined,
  purchaseOrders: any[] | null | undefined
): {
  byIndex: LineItemOrderStatus[];
  totalItems: number;
  orderedItems: number;
  partialItems: number;
} {
  const items = Array.isArray(lineItems) ? lineItems : [];
  const activePOs = (Array.isArray(purchaseOrders) ? purchaseOrders : []).filter(
    (po) => po && po.status !== 'cancelled'
  );

  const flatPoItems: Array<{ item: any; poNumber: string }> = [];
  for (const po of activePOs) {
    const poNumber = String(po.po_number || po.poNumber || 'PO');
    const poItems = Array.isArray(po.items) ? po.items : [];
    for (const item of poItems) {
      flatPoItems.push({ item, poNumber });
    }
  }

  let orderedItems = 0;
  let partialItems = 0;

  const byIndex: LineItemOrderStatus[] = items.map((li) => {
    const requiredQty = Math.max(1, Number(li?.quantity) || 1);
    let orderedQty = 0;
    const poSet = new Set<string>();

    for (const entry of flatPoItems) {
      if (poItemMatchesLineItem(entry.item, li)) {
        orderedQty += Math.max(1, Number(entry.item?.quantity) || 1);
        poSet.add(entry.poNumber);
      }
    }

    const status: 'ordered' | 'partial' | 'pending' =
      orderedQty >= requiredQty ? 'ordered' : orderedQty > 0 ? 'partial' : 'pending';

    if (status === 'ordered') orderedItems += 1;
    else if (status === 'partial') partialItems += 1;

    return {
      orderedQty,
      requiredQty,
      status,
      poNumbers: Array.from(poSet),
    };
  });

  return {
    byIndex,
    totalItems: items.length,
    orderedItems,
    partialItems,
  };
}
