import type { Context, Hono } from 'hono';
import type { Bindings, JwtPayload } from '../env';
import { UNTRUSTED_DATA_GUARD, llmJson, wrapUntrustedData } from '../lib/llm';

type App = Hono<{ Bindings: Bindings; Variables: { user: JwtPayload | null; tenantId: string } }>;

interface ExtractedTradeFields {
  docType: string;
  docNumber: string | null;
  currency: string | null;
  totalValue: number | null;
  grossWeightKg: number | null;
  packageCount: number | null;
  containerNumbers: string[];
  hsHints: string[];
}

function deterministicExtractText(rawText: string, docType: string): ExtractedTradeFields {
  const numMatch = rawText.match(/(?:INV|PL|BL|DOC)[-\s#:/]*([A-Z0-9-]{4,24})/i);
  const currencyMatch = rawText.match(/\b(USD|VND|EUR|JPY)\b/i);
  const valMatch = rawText.match(/(?:Total\s*(?:Amount|Value)?|Amount)\s*[:=]?\s*\$?\s*([0-9][0-9,\.]{1,18})/i);
  const weightMatch = rawText.match(/(?:Gross\s*Weight|G\.?W\.?|Trọng\s*lượng)\s*[:=]?\s*([0-9][0-9,\.]{0,12})\s*(?:kg|kgs|mt)?/i);
  const pkgMatch = rawText.match(/(?:Packages?|Cartons?|Kiện|Pallets?)\s*[:=]?\s*([0-9]{1,7})/i);
  const containerMatches = rawText.match(/\b[A-Z]{4}\d{7}\b/g) || [];
  const hsMatches = rawText.match(/\b\d{4}\.\d{2}(?:\.\d{2})?\b/g) || [];

  return {
    docType,
    docNumber: numMatch ? numMatch[1] : null,
    currency: currencyMatch ? currencyMatch[1].toUpperCase() : null,
    totalValue: valMatch ? Number(valMatch[1].replace(/,/g, '')) || null : null,
    grossWeightKg: weightMatch ? Number(weightMatch[1].replace(/,/g, '')) || null : null,
    packageCount: pkgMatch ? parseInt(pkgMatch[1], 10) || null : null,
    containerNumbers: Array.from(new Set(containerMatches)),
    hsHints: Array.from(new Set(hsMatches)),
  };
}

export function registerTradeDocumentRoutes(app: App) {
  app.post('/v1/trade-documents/extract', async (c: Context) => {
    const env = c.env as Bindings;
    const body = await c.req.json().catch(() => ({}));
    const rawText = String(body?.rawText || '').slice(0, 32000);
    const docType = String(body?.docType || 'COMMERCIAL_INVOICE').toUpperCase();

    if (!rawText.trim()) {
      return c.json({ ok: false, error: 'rawText is required for extraction' }, 400);
    }

    if (body?.isEncrypted || /%PDF.*Encrypt/i.test(rawText)) {
      return c.json(
        {
          ok: false,
          extraction_status: 'FAILED_PASSWORD_PROTECTED',
          requires_manual_upload: true,
          error: 'Password-protected document cannot be extracted safely',
        },
        422,
      );
    }

    const fallback = deterministicExtractText(rawText, docType);
    try {
      const llm = await llmJson<Partial<ExtractedTradeFields>>(
        env,
        `Extract Commercial Invoice / Packing List / B/L JSON fields only. ${UNTRUSTED_DATA_GUARD}`,
        `Extract JSON {"docNumber":string|null,"currency":string|null,"totalValue":number|null,"grossWeightKg":number|null,"packageCount":number|null,"containerNumbers":string[],"hsHints":string[]} from:\n${wrapUntrustedData('trade_document_text', rawText)}`,
        env.DEFAULT_MODEL,
      );
      const hasLlmPayload = Boolean((env as any).AI || env.OPENAI_API_KEY);
      return c.json({
        ok: true,
        method: hasLlmPayload ? 'llm_cf_or_openai' : 'deterministic_regex_fallback',
        fallback_used: !hasLlmPayload,
        advisory_only: true,
        requires_human_verification: true,
        extracted: {
          docType,
          docNumber: llm?.docNumber ?? fallback.docNumber,
          currency: llm?.currency ?? fallback.currency,
          totalValue: typeof llm?.totalValue === 'number' ? llm.totalValue : fallback.totalValue,
          grossWeightKg: typeof llm?.grossWeightKg === 'number' ? llm.grossWeightKg : fallback.grossWeightKg,
          packageCount: typeof llm?.packageCount === 'number' ? llm.packageCount : fallback.packageCount,
          containerNumbers: Array.isArray(llm?.containerNumbers) ? llm.containerNumbers : fallback.containerNumbers,
          hsHints: Array.isArray(llm?.hsHints) ? llm.hsHints : fallback.hsHints,
        },
      });
    } catch {
      return c.json({
        ok: true,
        method: 'deterministic_regex_fallback',
        fallback_used: true,
        advisory_only: true,
        requires_human_verification: true,
        extracted: fallback,
      });
    }
  });

  app.post('/v1/trade-documents/reconcile', async (c: Context) => {
    const body = await c.req.json().catch(() => ({}));
    const ci = body?.commercialInvoice || {};
    const pl = body?.packingList || {};
    const bl = body?.billOfLading || {};
    const discrepancies: Array<{ field: string; docs: string; expected: unknown; actual: unknown }> = [];

    if (ci.grossWeightKg !== undefined && pl.grossWeightKg !== undefined) {
      if (Math.abs(Number(ci.grossWeightKg) - Number(pl.grossWeightKg)) > 0.5) {
        discrepancies.push({
          field: 'grossWeightKg',
          docs: 'COMMERCIAL_INVOICE vs PACKING_LIST',
          expected: ci.grossWeightKg,
          actual: pl.grossWeightKg,
        });
      }
    }
    if (ci.packageCount !== undefined && pl.packageCount !== undefined) {
      if (Number(ci.packageCount) !== Number(pl.packageCount)) {
        discrepancies.push({
          field: 'packageCount',
          docs: 'COMMERCIAL_INVOICE vs PACKING_LIST',
          expected: ci.packageCount,
          actual: pl.packageCount,
        });
      }
    }
    if (pl.grossWeightKg !== undefined && bl.grossWeightKg !== undefined) {
      if (Math.abs(Number(pl.grossWeightKg) - Number(bl.grossWeightKg)) > 1) {
        discrepancies.push({
          field: 'grossWeightKg',
          docs: 'PACKING_LIST vs BILL_OF_LADING',
          expected: pl.grossWeightKg,
          actual: bl.grossWeightKg,
        });
      }
    }
    if (ci.currency && bl.currency && ci.currency !== bl.currency) {
      discrepancies.push({
        field: 'currency',
        docs: 'COMMERCIAL_INVOICE vs BILL_OF_LADING',
        expected: ci.currency,
        actual: bl.currency,
      });
    }

    return c.json({
      ok: true,
      matched: discrepancies.length === 0,
      status: discrepancies.length === 0 ? 'VERIFIED' : 'MISMATCH_FOUND',
      discrepancyCount: discrepancies.length,
      discrepancies,
    });
  });
}
