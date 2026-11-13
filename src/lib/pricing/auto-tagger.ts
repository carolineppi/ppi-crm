import { generateObject } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';

export const CANONICAL_EQUIVALENT_GROUPS = [
  'Single Roll Toilet Tissue Dispenser',
  'Double Roll Toilet Tissue Dispenser',
  'Jumbo Roll Toilet Tissue Dispenser',
  'Folded Toilet Tissue Dispenser',
  '3-in-1 Towel / Waste / Dryer',
  'Paper Towel & Waste Combination',
  'Automatic Roll Paper Towel Dispenser',
  'Manual Roll Paper Towel Dispenser',
  'Folded Paper Towel Dispenser',
  'Automatic / Touchless Soap Dispenser',
  'Deck-Mounted Soap Dispenser',
  'Foam Soap Dispenser',
  'Manual Liquid Soap Dispenser',
  'Grab Bar - Swing-Up',
  'Grab Bar - L-Shaped / Corner',
  'Grab Bar - 12" Straight',
  'Grab Bar - 18" Straight',
  'Grab Bar - 24" Straight',
  'Grab Bar - 30" Straight',
  'Grab Bar - 36" Straight',
  'Grab Bar - 42" Straight',
  'Grab Bar - 48" Straight',
  'Baby Changing Station - Horizontal',
  'Baby Changing Station - Vertical',
  'Baby Changing Station - Recessed',
  'Baby Changing Station - Adult / Extended',
  'Baby Changing Station Liners',
  'Tilt Mirror',
  'Shelf Mirror',
  'Mirror - Framed',
  'Mirror - Frameless',
  'Sanitary Napkin & Tampon Vendor',
  'Sanitary Napkin Disposal',
  'Seat Cover / Tissue / Disposal Combo',
  'Recessed Seat Cover Dispenser',
  'Surface-Mounted Seat Cover Dispenser',
  'High-Speed Hand Dryer',
  'Recessed Hand Dryer',
  'Surface-Mounted Hand Dryer',
  'Recessed Waste Receptacle',
  'Surface-Mounted Waste Receptacle',
  'Folding Shower Seat',
  'Shower Curtain Rod',
  'Mop & Broom Holder',
  'Utility Shelf',
  'Robe / Clothes Hook',
  'Medicine Cabinet',
  'Spare Part / Replacement',
] as const;

/**
 * Fast deterministic preliminary classifier for Division 10 washroom accessories.
 * Returns a specific granular equivalent_group tag, or null if ambiguous (for AI fallback).
 */
export function classifyPreliminaryGroup(item: {
  sku: string;
  description: string;
  category?: string | null;
}): string | null {
  const desc = (item.description || '').toLowerCase();
  const cat = (item.category || '').toLowerCase();
  const text = `${cat} ${desc}`;

  if (cat.includes('spare part') || /\b(spare|replacement|key|spindle|liner only|valve|pump assembly|latch|gasket|o-ring)\b/i.test(desc)) {
    if (!desc.includes('changing station liner')) {
      return 'Spare Part / Replacement';
    }
  }

  // Baby changing stations
  if (text.includes('changing station') || text.includes('changing table')) {
    if (text.includes('liner')) return 'Baby Changing Station Liners';
    if (text.includes('adult') || text.includes('extended') || text.includes('universal')) {
      return 'Baby Changing Station - Adult / Extended';
    }
    if (text.includes('recess')) return 'Baby Changing Station - Recessed';
    if (text.includes('vertical')) return 'Baby Changing Station - Vertical';
    if (text.includes('horizontal')) return 'Baby Changing Station - Horizontal';
    return 'Baby Changing Station - Horizontal';
  }

  // 3-in-1 & Towel/Waste combinations
  if (text.includes('3-in-1') || (text.includes('towel') && text.includes('waste') && text.includes('dryer'))) {
    return '3-in-1 Towel / Waste / Dryer';
  }
  if (
    (text.includes('towel') && text.includes('waste')) ||
    text.includes('towel/waste') ||
    text.includes('combination unit')
  ) {
    return 'Paper Towel & Waste Combination';
  }

  // Seat cover combos & dispensers
  if (text.includes('seat cover')) {
    if (text.includes('toilet') || text.includes('tissue') || text.includes('napkin')) {
      return 'Seat Cover / Tissue / Disposal Combo';
    }
    if (text.includes('recess')) return 'Recessed Seat Cover Dispenser';
    return 'Surface-Mounted Seat Cover Dispenser';
  }

  // Toilet tissue / toilet paper holders (specific sub-types!)
  if (text.includes('toilet tissue') || text.includes('toilet paper') || text.includes('tissue dispenser') || text.includes('tissue holder')) {
    if (text.includes('jumbo') || text.includes('jrt')) return 'Jumbo Roll Toilet Tissue Dispenser';
    if (text.includes('double') || text.includes('dual') || text.includes('two-roll') || text.includes('2-roll')) {
      return 'Double Roll Toilet Tissue Dispenser';
    }
    if (text.includes('folded')) return 'Folded Toilet Tissue Dispenser';
    if (text.includes('single')) return 'Single Roll Toilet Tissue Dispenser';
    return 'Single Roll Toilet Tissue Dispenser';
  }

  // Paper towel dispensers
  if (text.includes('towel dispenser') || text.includes('towel disp')) {
    if (text.includes('auto') || text.includes('sensor') || text.includes('touchless') || text.includes('battery') || text.includes('ac power')) {
      return 'Automatic Roll Paper Towel Dispenser';
    }
    if (text.includes('c-fold') || text.includes('multifold') || text.includes('singlefold') || text.includes('folded')) {
      return 'Folded Paper Towel Dispenser';
    }
    if (text.includes('roll')) return 'Manual Roll Paper Towel Dispenser';
    return 'Folded Paper Towel Dispenser';
  }

  // Soap dispensers
  if (text.includes('soap dispenser') || text.includes('soap disp')) {
    if (text.includes('deck') || text.includes('lavatory') || text.includes('counter')) {
      return 'Deck-Mounted Soap Dispenser';
    }
    if (text.includes('auto') || text.includes('sensor') || text.includes('touchless')) {
      return 'Automatic / Touchless Soap Dispenser';
    }
    if (text.includes('foam')) return 'Foam Soap Dispenser';
    return 'Manual Liquid Soap Dispenser';
  }

  // Grab bars (with length!)
  if (text.includes('grab bar')) {
    if (text.includes('swing')) return 'Grab Bar - Swing-Up';
    if (text.includes('l-shape') || text.includes('90 deg') || text.includes('corner') || text.includes('two-wall')) {
      return 'Grab Bar - L-Shaped / Corner';
    }
    const lenMatch = desc.match(/\b(12|16|18|24|30|32|36|42|48|54|60)\s*(?:"|”|in\b|inch)/i);
    if (lenMatch) {
      return `Grab Bar - ${lenMatch[1]}" Straight`;
    }
    return 'Grab Bar - Straight';
  }

  // Hand dryers
  if (text.includes('hand dryer')) {
    if (text.includes('recess')) return 'Recessed Hand Dryer';
    if (text.includes('high-speed') || text.includes('high speed')) return 'High-Speed Hand Dryer';
    return 'Surface-Mounted Hand Dryer';
  }

  // Sanitary napkin / tampon
  if (text.includes('napkin') || text.includes('tampon')) {
    if (text.includes('vendor')) return 'Sanitary Napkin & Tampon Vendor';
    if (text.includes('disposal')) return 'Sanitary Napkin Disposal';
  }

  // Mirrors
  if (text.includes('mirror')) {
    if (text.includes('tilt')) return 'Tilt Mirror';
    if (text.includes('shelf')) return 'Shelf Mirror';
    if (text.includes('frameless')) return 'Mirror - Frameless';
    return 'Mirror - Framed';
  }

  // Waste receptacles
  if (text.includes('waste receptacle')) {
    if (text.includes('recess')) return 'Recessed Waste Receptacle';
    return 'Surface-Mounted Waste Receptacle';
  }

  // Shower, custodial, hooks, shelves
  if (text.includes('shower seat')) return 'Folding Shower Seat';
  if (text.includes('shower curtain rod') || text.includes('shower rod')) return 'Shower Curtain Rod';
  if (text.includes('mop') && text.includes('broom')) return 'Mop & Broom Holder';
  if (text.includes('utility shelf') || (text.includes('shelf') && !text.includes('mirror'))) return 'Utility Shelf';
  if (text.includes('clothes hook') || text.includes('robe hook') || text.includes('coat hook')) return 'Robe / Clothes Hook';
  if (text.includes('medicine cabinet')) return 'Medicine Cabinet';

  return null;
}

const aiTagBatchSchema = z.object({
  tags: z.array(
    z.object({
      id: z.string(),
      equivalentGroup: z
        .string()
        .describe('Specific, granular washroom accessory category (e.g. "Double Roll Toilet Tissue Dispenser", "Grab Bar - 36\\" Straight")'),
    })
  ),
});

export async function aiTagPriceItemsBatch(
  items: Array<{
    id: string;
    manufacturer: string;
    sku: string;
    description: string;
    category?: string | null;
  }>,
  existingGroups: string[]
): Promise<Array<{ id: string; equivalentGroup: string }>> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey || items.length === 0) return [];

  const google = createGoogleGenerativeAI({ apiKey });
  const canonicalList = Array.from(new Set([...CANONICAL_EQUIVALENT_GROUPS, ...existingGroups]));

  const prompt = `You are a Division 10 commercial washroom accessories estimating expert.
Assign a specific, granular "equivalentGroup" category to each product below so estimators can compare equivalent products across Bobrick, ASI, Bradley, and Sova side-by-side.

RULES:
1. NEVER use overly broad categories like "Toilet Paper Holder" or "Soap Dispenser" or "Grab Bar".
2. ALWAYS use specific sub-types, e.g.:
   - "Single Roll Toilet Tissue Dispenser", "Double Roll Toilet Tissue Dispenser", "Jumbo Roll Toilet Tissue Dispenser", "Folded Toilet Tissue Dispenser"
   - "Grab Bar - 24\\" Straight", "Grab Bar - 36\\" Straight", "Grab Bar - 42\\" Straight", "Grab Bar - Swing-Up"
   - "Automatic / Touchless Soap Dispenser", "Manual Liquid Soap Dispenser", "Foam Soap Dispenser", "Deck-Mounted Soap Dispenser"
   - "Automatic Roll Paper Towel Dispenser", "Manual Roll Paper Towel Dispenser", "Folded Paper Towel Dispenser", "Paper Towel & Waste Combination"
3. Prefer reusing one of these existing group names whenever it matches:
${canonicalList.map((g) => `- ${g}`).join('\n')}

PRODUCTS TO TAG:
${items
  .map((it) => `id=${it.id} | mfg=${it.manufacturer} | sku=${it.sku} | cat=${it.category || ''} | desc=${it.description}`)
  .join('\n')}`;

  try {
    const result = await generateObject({
      model: google('gemini-2.5-flash'),
      schema: aiTagBatchSchema,
      prompt,
    });
    return result.object.tags;
  } catch (err) {
    console.warn('AI batch tagging failed:', err);
    return [];
  }
}
