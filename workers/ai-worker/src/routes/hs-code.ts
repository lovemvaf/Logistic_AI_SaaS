import type { Context, Hono } from 'hono';
import type { Bindings, JwtPayload } from '../env';
import { UNTRUSTED_DATA_GUARD, llmJson, wrapUntrustedData } from '../lib/llm';

type App = Hono<{ Bindings: Bindings; Variables: { user: JwtPayload | null; tenantId: string } }>;

export interface HsCandidate {
  hsCode: string;
  description: string;
  confidence: number;
  rationale: string;
}

const RULE_HS_CATALOG: Array<{ keywords: string[]; hsCode: string; description: string }> = [
  { keywords: ['pcb', 'circuit', 'ic', 'microchip', 'semiconductor', 'linh kien dien tu'], hsCode: '8534.00.90', description: 'Printed circuits & electronic assemblies' },
  { keywords: ['capacitor', 'resistor', 'transistor', 'sensor'], hsCode: '8541.49.00', description: 'Semiconductor & passive components' },
  { keywords: ['shoe', 'footwear', 'sneaker', 'giay', 'dep'], hsCode: '6403.99.90', description: 'Footwear with outer soles of rubber/plastics' },
  { keywords: ['garment', 'shirt', 'cotton', 'textile', 'may mac'], hsCode: '6205.20.00', description: 'Woven textile garments' },
  { keywords: ['furniture', 'wood', 'chair', 'cabinet', 'noi that', 'go'], hsCode: '9403.60.90', description: 'Other wooden furniture' },
  { keywords: ['cashew', 'coffee', 'ca phe', 'hat dieu'], hsCode: '0801.32.00', description: 'Shelled cashew nuts / agricultural export' },
  { keywords: ['plastic', 'polyethylene', 'polymer', 'nhua'], hsCode: '3926.90.99', description: 'Industrial articles of plastics' },
  { keywords: ['machinery', 'motor', 'pump', 'cnc', 'may moc'], hsCode: '8479.89.99', description: 'Industrial machines and mechanical appliances' },
];

export function suggestHsDeterministic(itemDescription: string, topK = 3): HsCandidate[] {
  const lower = itemDescription.toLowerCase();
  const scored: HsCandidate[] = [];

  for (const row of RULE_HS_CATALOG) {
    const hits = row.keywords.filter((kw) => lower.includes(kw)).length;
    if (hits > 0) {
      scored.push({
        hsCode: row.hsCode,
        description: row.description,
        confidence: Math.min(0.88, 0.55 + hits * 0.14),
        rationale: `Matched tariff keyword rule (${hits} hit(s))`,
      });
    }
  }

  if (scored.length === 0) {
    scored.push({
      hsCode: '3926.90.99',
      description: 'General manufactured goods (Customs Specialist Classification Required)',
      confidence: 0.35,
      rationale: 'No high-confidence keyword match — low confidence fallback',
    });
  }

  return scored.sort((a, b) => b.confidence - a.confidence).slice(0, Math.max(1, Math.min(topK, 5)));
}

export function registerHsCodeRoutes(app: App) {
  app.post('/v1/hs-code/suggest', async (c: Context) => {
    const env = c.env as Bindings;
    const body = await c.req.json().catch(() => ({}));
    const itemDescription = String(body?.itemDescription || '').trim();
    const topK = Number(body?.topK || 3);

    if (!itemDescription) {
      return c.json({ ok: false, error: 'itemDescription is required' }, 400);
    }

    const fallbackCandidates = suggestHsDeterministic(itemDescription, topK);
    let candidates = fallbackCandidates;
    let fallbackUsed = true;

    try {
      if ((env as any).AI || env.OPENAI_API_KEY) {
        const res = await llmJson<{ candidates?: HsCandidate[] }>(
          env,
          `Suggest top-${topK} advisory HS codes (8-digit ASEAN/Vietnam tariff style) as JSON. ${UNTRUSTED_DATA_GUARD}`,
          `Return JSON {"candidates":[{"hsCode":"XXXX.XX.XX","description":string,"confidence":0-1,"rationale":string}]} for untrusted cargo description:\n${wrapUntrustedData('cargo_description', itemDescription)}`,
          env.DEFAULT_MODEL,
        );
        if (Array.isArray(res?.candidates) && res.candidates.length > 0) {
          candidates = res.candidates.slice(0, topK);
          fallbackUsed = false;
        }
      }
    } catch {
      fallbackUsed = true;
    }

    return c.json({
      ok: true,
      advisoryOnly: true,
      requiresHumanReview: true,
      status: 'NEEDS_CUSTOMS_REVIEW',
      method: fallbackUsed ? 'rule_tariff_fallback' : 'llm_cf_or_openai',
      fallback_used: fallbackUsed,
      candidates,
      legalDisclaimer:
        'AI HS code suggestions are advisory only (NEEDS_CUSTOMS_REVIEW). Final classification must be verified and approved by a licensed customs specialist prior to submission.',
    });
  });
}
