import { solveContainerDrayage } from '../src/lib/container-routing';
import { suggestHsDeterministic } from '../src/routes/hs-code';
import { registerTradeDocumentRoutes } from '../src/routes/trade-documents';
import { registerHsCodeRoutes } from '../src/routes/hs-code';
import { Hono } from 'hono';

let pass = 0;
let fail = 0;

function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++;
    console.log('  \u2713', name, extra !== undefined ? JSON.stringify(extra) : '');
  } else {
    fail++;
    console.log('  \u2717 FAIL', name, extra !== undefined ? JSON.stringify(extra) : '');
  }
}

async function run() {
  const depot = { lat: 10.9465, lng: 106.8428 }; // Bien Hoa ICD

  // 1. Container drayage pairs import delivery + empty return on backhaul
  const c1 = solveContainerDrayage(
    depot,
    [
      {
        id: 'IMP-1',
        lat: 10.761,
        lng: 106.794, // Cat Lai external
        sizeType: '40HC',
        grossWeightKg: 24000,
        earliestMinute: 450,
        latestMinute: 600,
        moveType: 'IMPORT_DELIVERY',
        corridorTag: 'SOUTH',
      },
      {
        id: 'RET-1',
        lat: 10.77,
        lng: 106.82,
        sizeType: '40HC',
        grossWeightKg: 3800,
        earliestMinute: 480,
        latestMinute: 900,
        moveType: 'EMPTY_RETURN',
        corridorTag: 'SOUTH',
      },
    ],
    [{ id: 'TRC-01', maxGrossKg: 32000, supportedSizes: ['20GP', '40HC'] }],
  );
  ok(
    'Enterprise Container VRP pairs backhaul and discloses distance_source',
    c1.ok === true &&
      c1.distance_source === 'haversine_circuity_1.41' &&
      c1.evaluation_status === 'unmeasured_heuristic' &&
      c1.assignments[0]?.backhaulPairedCount === 1,
    c1.summary,
  );

  // 2. Reefer container blocked when no genset tractor available
  const c2 = solveContainerDrayage(
    depot,
    [
      {
        id: 'RF-1',
        lat: 10.9,
        lng: 106.85,
        sizeType: '40RF',
        grossWeightKg: 22000,
        earliestMinute: 480,
        latestMinute: 700,
        moveType: 'EXPORT_PICKUP',
      },
    ],
    [{ id: 'TRC-DRY', maxGrossKg: 32000, supportedSizes: ['20GP', '40HC', '40RF'], supportsReefer: false }],
  );
  ok(
    'Container VRP rejects 40RF without reefer genset capability',
    c2.ok === false && c2.unassigned[0]?.reason === 'NO_REEFER_GENSET_TRACTOR',
    c2.unassigned,
  );

  // 3. Deterministic HS tariff rule returns advisory output
  const hs = suggestHsDeterministic('Printed circuit board PCB electronic subassembly');
  ok(
    'HS suggestion matches electronics rule',
    hs.length >= 1 && hs[0].hsCode === '8534.00.90' && hs[0].confidence >= 0.6,
    hs[0],
  );

  // 4. Hono route tests for /v1/trade-documents/* & /v1/hs-code/suggest
  const app = new Hono<any>();
  registerTradeDocumentRoutes(app);
  registerHsCodeRoutes(app);

  const encRes = await app.request('/v1/trade-documents/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rawText: '%PDF-1.7 Encrypt', isEncrypted: true }),
  });
  const encJson: any = await encRes.json();
  ok(
    'Trade document extract rejects password-protected PDF cleanly (422)',
    encRes.status === 422 && encJson.extraction_status === 'FAILED_PASSWORD_PROTECTED',
    encJson,
  );

  const recRes = await app.request('/v1/trade-documents/reconcile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      commercialInvoice: { grossWeightKg: 14500, packageCount: 40, currency: 'USD' },
      packingList: { grossWeightKg: 15200, packageCount: 38 },
      billOfLading: { grossWeightKg: 15200, currency: 'USD' },
    }),
  });
  const recJson: any = await recRes.json();
  ok(
    'Trade document reconcile flags weight & package mismatch between CI and PL',
    recRes.status === 200 && recJson.matched === false && recJson.discrepancyCount === 2,
    recJson,
  );

  const hsRes = await app.request('/v1/hs-code/suggest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ itemDescription: 'Wooden dining chair furniture export', topK: 2 }),
  });
  const hsJson: any = await hsRes.json();
  ok(
    'HS suggest endpoint always flags advisoryOnly & NEEDS_CUSTOMS_REVIEW',
    hsRes.status === 200 &&
      hsJson.advisoryOnly === true &&
      hsJson.requiresHumanReview === true &&
      hsJson.status === 'NEEDS_CUSTOMS_REVIEW',
    { status: hsJson.status, top: hsJson.candidates?.[0] },
  );

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}

run();
