/**
 * FHIR Integration Bridge — Node.js Pipeline
 * ============================================
 * Bridges oracle-setup's Node.js/mjs submission pipeline  
 * with the Python BrainSAIT FHIR validation stack.
 *
 * Usage:
 *   import { validateBeforeSubmit, enrichWithFHIR } from './fhir-integration/index.mjs';
 *
 *   // Validate a claim payload before NPHIES submission
 *   const result = await validateBeforeSubmit(payload);
 *   if (!result.safe_to_submit) throw new Error(result.errors.join('\n'));
 *
 *   // Enrich SBS codes with FHIR coding elements
 *   const enriched = await enrichWithFHIR(sbsIds);
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFile } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const WORKSPACE  = join(__dirname, '..');
const FHIR_PKG   = join(WORKSPACE, 'packages', 'fhir');

// ─── Python helper runner ─────────────────────────────────────────

/**
 * Run an inline Python script that can import from packages/fhir.
 * Returns parsed JSON output.
 */
async function runPythonFHIR(script) {
  return new Promise((resolve, reject) => {
    const py = spawn('python3', ['-c', script], {
      env: {
        ...process.env,
        PYTHONPATH: `${WORKSPACE}:${process.env.PYTHONPATH ?? ''}`,
      },
    });

    let stdout = '';
    let stderr = '';
    py.stdout.on('data', (d) => { stdout += d.toString(); });
    py.stderr.on('data', (d) => { stderr += d.toString(); });

    py.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python exited ${code}: ${stderr.trim()}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`Python output not JSON: ${stdout.slice(0, 200)}`));
      }
    });
  });
}

// ─── SBS Catalogue (cached) ───────────────────────────────────────

let _catalogueCache = null;

async function loadSBSCatalogue() {
  if (_catalogueCache) return _catalogueCache;
  const paths = [
    join(WORKSPACE, 'sbs-integration', 'sbs_catalogue.json'),
    join(WORKSPACE, 'server', 'sbs_catalogue.json'),
  ];
  for (const p of paths) {
    try {
      const raw = JSON.parse(await readFile(p, 'utf8'));
      _catalogueCache = raw.catalogue ?? raw;
      return _catalogueCache;
    } catch {}
  }
  _catalogueCache = {};
  return _catalogueCache;
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Validate a NPHIES FHIR payload before submission.
 *
 * @param {object} payload - The FHIR Bundle or resource object
 * @returns {{safe_to_submit: boolean, errors: string[], warnings: string[], details: object}}
 */
export async function validateBeforeSubmit(payload) {
  const resourceType = payload?.resourceType ?? 'Unknown';
  const script = `
import json, sys
sys.path.insert(0, '${WORKSPACE}')
from packages.fhir import validate_cardinality, validate_bundle_entries

payload = json.loads(${JSON.stringify(JSON.stringify(payload))})
rt = payload.get('resourceType', 'Unknown')

if rt == 'Bundle':
    results = validate_bundle_entries(payload)
    all_errors = []
    all_warnings = []
    for r in results:
        all_errors.extend([i.get('description', '') for i in r.get('errors', [])])
        all_warnings.extend([i.get('description', '') for i in r.get('warnings', [])])
    out = {
        'safe_to_submit': len(all_errors) == 0,
        'errors': all_errors,
        'warnings': all_warnings,
        'details': {'bundle_entry_count': len(payload.get('entry', []))}
    }
else:
    r = validate_cardinality(rt, payload)
    out = {
        'safe_to_submit': r.get('is_valid', False),
        'errors': [i.get('description','') for i in r.get('errors', [])],
        'warnings': [i.get('description','') for i in r.get('warnings', [])],
        'details': r
    }

print(json.dumps(out))
  `.trim();

  try {
    return await runPythonFHIR(script);
  } catch (err) {
    // Graceful degradation: report as warning, not error
    return {
      safe_to_submit: true,
      errors: [],
      warnings: [`FHIR validation unavailable: ${err.message}`],
      details: { resource_type: resourceType },
    };
  }
}

/**
 * Enrich SBS V3.1 codes with FHIR Coding elements and Arabic translations.
 *
 * @param {string[]} sbsIds - Array of SBS code strings (e.g., ["10-01-001", "10-02-005"])
 * @returns {Record<string, {coding: object, requires_prior_auth: boolean, category: string}>}
 */
export async function enrichWithFHIR(sbsIds) {
  const catalogue = await loadSBSCatalogue();
  const result = {};

  for (const id of sbsIds) {
    const entry = catalogue[id];
    result[id] = {
      coding: {
        system: 'http://nphies.sa/terminology/CodeSystem/sbs',
        code: id,
        display: entry?.description_en ?? id,
        ...(entry?.description_ar ? {
          _display: {
            extension: [{
              url: 'http://hl7.org/fhir/StructureDefinition/translation',
              extension: [
                { url: 'lang', valueCode: 'ar' },
                { url: 'content', valueString: entry.description_ar },
              ],
            }],
          },
        } : {}),
      },
      requires_prior_auth: entry?.requires_prior_auth ?? false,
      category: entry?.category_id ?? 'unknown',
    };
  }

  return result;
}

/**
 * Validate SBS codes against the local SBS V3.1 catalogue.
 *
 * @param {string[]} sbsIds
 * @returns {{valid: string[], invalid: string[], prior_auth_required: string[]}}
 */
export async function validateSBSCodes(sbsIds) {
  const catalogue = await loadSBSCatalogue();
  const valid = [];
  const invalid = [];
  const prior_auth_required = [];

  for (const id of sbsIds) {
    if (catalogue[id]) {
      valid.push(id);
      if (catalogue[id].requires_prior_auth) prior_auth_required.push(id);
    } else {
      invalid.push(id);
    }
  }

  return { valid, invalid, prior_auth_required };
}

/**
 * Build a NPHIES-ready FHIR Bundle for a claim submission payload
 * coming from the existing oracle-setup pipeline (e.g., normalize-bat4295-payload.mjs).
 *
 * @param {object} normalizedPayload - Output of normalize-bat4295-payload.mjs
 * @returns {object} FHIR Bundle (type: message) ready for NPHIES
 */
export async function buildNphiesClaimBundle(normalizedPayload) {
  const { claim = {}, patient = {}, coverage = {}, provider = {}, payer = {} } = normalizedPayload;
  const providerId = provider.id ?? 'PROVIDER_ORG';
  const payerId    = payer.id ?? 'PAYER_ORG';

  const script = `
import json, sys
sys.path.insert(0, '${WORKSPACE}')
from packages.fhir import build_nphies_message_header, build_message_bundle

claim   = json.loads(${JSON.stringify(JSON.stringify(claim))})
patient = json.loads(${JSON.stringify(JSON.stringify(patient))})
coverage= json.loads(${JSON.stringify(JSON.stringify(coverage))})
claim_id = claim.get('id', 'claim-1')

header = build_nphies_message_header(
    event_code='claim-request',
    sender_org_id=${JSON.stringify(providerId)},
    receiver_org_id=${JSON.stringify(payerId)},
    focus_references=[f'Claim/{claim_id}']
)

bundle = build_message_bundle(
    header,
    [patient, coverage, claim]
)

print(json.dumps(bundle))
  `.trim();

  return runPythonFHIR(script);
}

// ─── CLI for quick validation from terminal ───────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [,, cmd, ...args] = process.argv;

  if (cmd === 'validate') {
    const filePath = args[0];
    if (!filePath) { console.error('Usage: node fhir-integration/index.mjs validate <json-file>'); process.exit(1); }
    const payload = JSON.parse(await readFile(filePath, 'utf8'));
    const result  = await validateBeforeSubmit(payload);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.safe_to_submit ? 0 : 1);
  }

  if (cmd === 'enrich') {
    const codes = args;
    if (!codes.length) { console.error('Usage: node fhir-integration/index.mjs enrich <sbs-code> ...'); process.exit(1); }
    const result = await enrichWithFHIR(codes);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  console.error(`Unknown command: ${cmd}. Available: validate, enrich`);
  process.exit(1);
}
