export interface ParentCategoryDef {
  id: string;
  label: string;
  subGroups: string[];
}

export const PARENT_CATEGORIES: ParentCategoryDef[] = [
  {
    id: 'toilet_tissue',
    label: 'Toilet Tissue Dispensers',
    subGroups: [
      'Single Roll Toilet Tissue Dispenser',
      'Double Roll Toilet Tissue Dispenser',
      'Jumbo Roll Toilet Tissue Dispenser',
      'Folded Toilet Tissue Dispenser',
    ],
  },
  {
    id: 'paper_towel',
    label: 'Paper Towel & Combos',
    subGroups: [
      'Automatic Roll Paper Towel Dispenser',
      'Manual Roll Paper Towel Dispenser',
      'Folded Paper Towel Dispenser',
      'Paper Towel & Waste Combination',
      '3-in-1 Towel / Waste / Dryer',
    ],
  },
  {
    id: 'grab_bars',
    label: 'Grab Bars',
    subGroups: [
      'Grab Bar - 12" Straight',
      'Grab Bar - 16" Straight',
      'Grab Bar - 18" Straight',
      'Grab Bar - 24" Straight',
      'Grab Bar - 30" Straight',
      'Grab Bar - 32" Straight',
      'Grab Bar - 36" Straight',
      'Grab Bar - 42" Straight',
      'Grab Bar - 48" Straight',
      'Grab Bar - 54" Straight',
      'Grab Bar - 60" Straight',
      'Grab Bar - Swing-Up',
      'Grab Bar - L-Shaped / Corner',
      'Grab Bar - Straight',
    ],
  },
  {
    id: 'soap',
    label: 'Soap Dispensers',
    subGroups: [
      'Automatic / Touchless Soap Dispenser',
      'Manual Liquid Soap Dispenser',
      'Foam Soap Dispenser',
      'Deck-Mounted Soap Dispenser',
    ],
  },
  {
    id: 'baby_changing',
    label: 'Baby Changing Stations',
    subGroups: [
      'Baby Changing Station - Horizontal',
      'Baby Changing Station - Vertical',
      'Baby Changing Station - Recessed',
      'Baby Changing Station - Adult / Extended',
      'Baby Changing Station Liners',
    ],
  },
  {
    id: 'mirrors',
    label: 'Mirrors',
    subGroups: ['Mirror - Framed', 'Mirror - Frameless', 'Tilt Mirror', 'Shelf Mirror'],
  },
  {
    id: 'hand_dryers',
    label: 'Hand Dryers',
    subGroups: [
      'High-Speed Hand Dryer',
      'Recessed Hand Dryer',
      'Surface-Mounted Hand Dryer',
    ],
  },
  {
    id: 'waste_sanitary',
    label: 'Waste, Seat Covers & Sanitary',
    subGroups: [
      'Recessed Waste Receptacle',
      'Surface-Mounted Waste Receptacle',
      'Sanitary Napkin Disposal',
      'Sanitary Napkin & Tampon Vendor',
      'Surface-Mounted Seat Cover Dispenser',
      'Recessed Seat Cover Dispenser',
      'Seat Cover / Tissue / Disposal Combo',
    ],
  },
  {
    id: 'shower_custodial',
    label: 'Shower, Hooks & Custodial',
    subGroups: [
      'Folding Shower Seat',
      'Shower Curtain Rod',
      'Mop & Broom Holder',
      'Utility Shelf',
      'Robe / Clothes Hook',
      'Medicine Cabinet',
    ],
  },
  {
    id: 'spare_parts',
    label: 'Spare Parts',
    subGroups: ['Spare Part / Replacement'],
  },
];

export function getParentCategoryId(groupName: string | null | undefined): string {
  if (!groupName) return 'untagged';
  for (const cat of PARENT_CATEGORIES) {
    if (cat.subGroups.includes(groupName)) return cat.id;
  }
  const lower = groupName.toLowerCase();
  if (lower.includes('toilet tissue') || lower.includes('toilet paper') || lower.includes('tissue')) {
    return 'toilet_tissue';
  }
  if (lower.includes('towel')) return 'paper_towel';
  if (lower.includes('grab bar')) return 'grab_bars';
  if (lower.includes('soap')) return 'soap';
  if (lower.includes('changing')) return 'baby_changing';
  if (lower.includes('mirror')) return 'mirrors';
  if (lower.includes('hand dryer')) return 'hand_dryers';
  if (lower.includes('waste') || lower.includes('napkin') || lower.includes('tampon') || lower.includes('seat cover')) {
    return 'waste_sanitary';
  }
  if (lower.includes('spare')) return 'spare_parts';
  return 'shower_custodial';
}

export function getSubCategoryShortLabel(groupName: string): string {
  return groupName
    .replace(/^Grab Bar -\s*/i, '')
    .replace(/^Baby Changing Station -\s*/i, '')
    .replace(/^Mirror -\s*/i, '')
    .replace(/\s*Toilet Tissue Dispenser$/i, '')
    .replace(/\s*Paper Towel Dispenser$/i, '')
    .replace(/\s*Soap Dispenser$/i, '')
    .trim();
}
