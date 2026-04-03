"""
Bootstrap script for MasterLinc knowledge indexing.

Indexes these corpora into Qdrant or Chroma:
- Saudi NPHIES-related docs in docs/ and fhir/
- FHIR R4 helpers and validators in packages/fhir/
- BrainSAIT internal docs in docs/

Usage:
  python -m knowledge.bootstrap_masterlinc_kb

Environment:
  VECTOR_BACKEND=qdrant|chroma|memory
  QDRANT_URL=http://localhost:6333
  QDRANT_API_KEY=...
  CHROMA_PERSIST_DIR=.chroma
  HYPERDRIVE_DATABASE_URL=postgres://...  # Optional metadata/log reference
"""

import asyncio
import os
from pathlib import Path
from typing import Dict, List

from knowledge.vector_client import KnowledgeIndexer, KnowledgeSystem, VectorClient


def _collect_paths(root: Path) -> Dict[str, List[str]]:
    fhir_paths = sorted(
        {
            *root.joinpath("packages", "fhir").glob("**/*.py"),
            *root.joinpath("fhir").glob("**/*.py"),
        }
    )

    nphies_paths = sorted(
        {
            *root.joinpath("docs").glob("**/*NPHIES*.md"),
            *root.joinpath("docs").glob("**/*nphies*.md"),
            *root.joinpath("tests").glob("**/*nphies*.mjs"),
        }
    )

    brainsait_paths = sorted(
        {
            *root.joinpath("docs").glob("**/*.md"),
            root / "BRAINSAIT_RAG_DEPLOYMENT.md",
            root / "INTEGRATION_SUMMARY.md",
        }
    )

    return {
        "fhir": [str(p) for p in fhir_paths if p.is_file()],
        "nphies": [str(p) for p in nphies_paths if p.is_file()],
        "brainsait": [str(p) for p in brainsait_paths if p.is_file()],
    }


async def main():
    workspace = Path(__file__).resolve().parents[1]
    backend = os.environ.get("VECTOR_BACKEND", "memory")

    vector = VectorClient(
        backend=backend,
        config={
            "url": os.environ.get("QDRANT_URL"),
            "api_key": os.environ.get("QDRANT_API_KEY"),
            "persist_dir": os.environ.get("CHROMA_PERSIST_DIR", ".chroma"),
            # Hyperdrive-compatible DSN can be passed to external workers.
            "hyperdrive_dsn": os.environ.get("HYPERDRIVE_DATABASE_URL"),
        },
    )
    system = KnowledgeSystem(vector_client=vector)
    await system.initialize()

    indexer = KnowledgeIndexer(system)
    corpora = _collect_paths(workspace)

    reports = []
    for source, paths in corpora.items():
        if not paths:
            continue
        report = await indexer.index_paths(source=source, paths=paths)
        reports.append(report)

    print({"backend": backend, "reports": reports})


if __name__ == "__main__":
    asyncio.run(main())
