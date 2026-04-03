# MAOS + MCP Integration (Project 2)

This implementation delivers:

1. MAOS core with YAML-driven MasterLinc registry.
2. Agentic simulated hospital loop connected to FHIR/NPHIES validation workers.
3. Knowledge indexing and vector retrieval with Qdrant/Chroma backends and Hyperdrive-friendly configuration.

## 1) MAOS Core and Agent Registry

Main files:

- `maos/orchestrator.py`
- `maos/agent_registry.py`
- `maos/agent_router.py`
- `maos/api_gateway.py`
- `maos/registry/agents.masterlinc.yaml`

Highlights:

- Supports central registry files containing an `agents:` list.
- Maps OpenMAIC-style roles to BrainSAIT-specific names (DoctorLinc, ClaimLinc, etc.).
- Keeps compatibility with existing `agents/*.yaml` files.

Environment:

- `AGENT_REGISTRY_FILE=maos/registry/agents.masterlinc.yaml`
- `AGENTS_DIR=agents`

## 2) Agentic Simulated Hospital

Main file:

- `scenarios/hospital_simulation.py`

Highlights:

- Iterative loop (`loop_cycles`) for patient/triage/doctor/lab/risk/treatment progression.
- Builds a simulated NPHIES/FHIR message bundle.
- Runs FHIR/NPHIES validation-worker style output using:
  - `fhir_validator`
  - `nphies_rule_engine`

Simulation output includes:

- `loops_executed`
- `pipeline.loop_trace`
- `pipeline.validation_workers`
- `outcome.fhir_nphies_ready`
- `outcome.validation_errors`

## 3) Knowledge Base and Vector Search

Main files:

- `knowledge/vector_client.py`
- `knowledge/bootstrap_masterlinc_kb.py`

Highlights:

- `VectorClient` supports `memory`, `qdrant`, and `chroma` backends.
- `KnowledgeIndexer` indexes chunked corpora for:
  - FHIR R4 resources
  - Saudi NPHIES docs
  - BrainSAIT internal docs
- Hyperdrive-compatible DSN accepted as config input:
  - `HYPERDRIVE_DATABASE_URL`

Environment examples:

- `VECTOR_BACKEND=qdrant`
- `QDRANT_URL=http://localhost:6333`
- `QDRANT_API_KEY=...`

or

- `VECTOR_BACKEND=chroma`
- `CHROMA_PERSIST_DIR=.chroma`

Index command:

```bash
python -m knowledge.bootstrap_masterlinc_kb
```

## Validation

Compile check:

```bash
python3 -m compileall maos scenarios knowledge
```

Smoke check (from repo root):

```bash
PYTHONPATH=. python3 - <<'PY'
import asyncio
from maos.orchestrator import MAOSOrchestrator
from scenarios.hospital_simulation import HospitalSimulation

async def main():
    orch = MAOSOrchestrator(config={
        'agents_dir': 'agents',
        'registry_file': 'maos/registry/agents.masterlinc.yaml',
    })
    await orch.start()
    print('agents_loaded:', len(orch.registry.agents))
    sim = HospitalSimulation()
    result = await sim.run(scenario_id='cardiac-chest-pain')
    print('loops_executed:', result.get('loops_executed'))
    print('fhir_nphies_ready:', result.get('outcome', {}).get('fhir_nphies_ready'))
    await orch.stop()

asyncio.run(main())
PY
```
