#!/usr/bin/env bash
# apply-patch.sh — Deploy fhir_validator_enhanced.py to the SBS nphies-bridge
# ============================================================================
# Usage:   ./apply-patch.sh [/path/to/SBS-GIVC/sbs]
#          Defaults to ~/sbs if the argument is omitted.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SBS_REPO="${1:-${HOME}/sbs}"
TARGET="${SBS_REPO}/nphies-bridge/fhir_validator.py"
FHIR_PKG_SRC="${SCRIPT_DIR}/../packages/fhir"
FHIR_PKG_DST="${SBS_REPO}/packages/fhir"

# ── Pre-flight ──────────────────────────────────────────────────────────────

echo "SBS repo : ${SBS_REPO}"
echo "Target   : ${TARGET}"

if [[ ! -d "${SBS_REPO}/nphies-bridge" ]]; then
  echo "ERROR: ${SBS_REPO}/nphies-bridge not found."
  echo "Please provide the correct path to your SBS clone."
  exit 1
fi

# ── Back up the original validator ─────────────────────────────────────────

BACKUP="${TARGET}.bak.$(date +%Y%m%d_%H%M%S)"
if [[ -f "${TARGET}" ]]; then
  cp "${TARGET}" "${BACKUP}"
  echo "Backup   : ${BACKUP}"
fi

# ── Deploy enhanced validator ───────────────────────────────────────────────

cp "${SCRIPT_DIR}/fhir_validator_enhanced.py" "${TARGET}"
echo "Deployed : fhir_validator_enhanced.py → ${TARGET}"

# ── Deploy BrainSAIT FHIR package ──────────────────────────────────────────

if [[ -d "${FHIR_PKG_SRC}" ]]; then
  mkdir -p "${FHIR_PKG_DST}"
  cp -r "${FHIR_PKG_SRC}/." "${FHIR_PKG_DST}/"
  echo "Deployed : packages/fhir → ${FHIR_PKG_DST}"
fi

# ── Deploy SBS data files if not already present ───────────────────────────

SBS_DB="${SBS_REPO}/database/official_sbs/processed"
for f in sbs_catalogue.json sbs_snomed_map.json; do
  src="${SCRIPT_DIR}/${f}"
  dst="${SBS_DB}/${f}"
  if [[ -f "${src}" && ! -f "${dst}" ]]; then
    cp "${src}" "${dst}"
    echo "Deployed : ${f} → ${SBS_DB}"
  fi
done

echo ""
echo "Done. Run the nphies-bridge tests to verify:"
echo "  cd ${SBS_REPO} && python -m pytest nphies-bridge/tests/ -v"
