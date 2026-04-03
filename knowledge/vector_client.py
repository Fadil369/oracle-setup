"""
BrainSAIT Knowledge System
Vector-based knowledge retrieval for FHIR documentation,
NPHIES specifications, research papers, and BrainSAIT docs.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("knowledge.vector_client")


class VectorClient:
    """
    Client for vector database operations.
    Supports Qdrant, Weaviate, Chroma, and in-memory backends.
    """

    def __init__(self, backend: str = "memory", config: Optional[Dict] = None):
        self.backend = backend
        self.config = config or {}
        self._store: Dict[str, Dict[str, Any]] = {}
        self._collections: Dict[str, List[Dict[str, Any]]] = {}

    async def connect(self):
        """Connect to the vector database."""
        logger.info("Vector client connected (%s)", self.backend)

    async def disconnect(self):
        """Disconnect from the vector database."""
        logger.info("Vector client disconnected")

    async def create_collection(self, name: str, dimension: int = 1536):
        """Create a vector collection."""
        self._collections[name] = []
        logger.info("Created collection: %s (dim=%d)", name, dimension)

    async def upsert(
        self,
        collection: str,
        doc_id: str,
        text: str,
        embedding: Optional[List[float]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """Insert or update a document with its embedding."""
        if collection not in self._collections:
            self._collections[collection] = []

        doc = {
            "id": doc_id,
            "text": text,
            "embedding": embedding or [],
            "metadata": metadata or {},
            "indexed_at": datetime.now(timezone.utc).isoformat(),
        }

        # Update or insert
        existing = [i for i, d in enumerate(self._collections[collection]) if d["id"] == doc_id]
        if existing:
            self._collections[collection][existing[0]] = doc
        else:
            self._collections[collection].append(doc)

    async def search(
        self,
        collection: str,
        query_embedding: Optional[List[float]] = None,
        query_text: str = "",
        top_k: int = 5,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """Search for similar documents."""
        docs = self._collections.get(collection, [])

        # Simple text matching for in-memory backend
        if query_text and not query_embedding:
            query_lower = query_text.lower()
            scored = []
            for doc in docs:
                text_lower = doc["text"].lower()
                score = sum(1 for word in query_lower.split() if word in text_lower)
                if score > 0:
                    scored.append({**doc, "score": score / len(query_lower.split())})

            scored.sort(key=lambda x: x["score"], reverse=True)
            return scored[:top_k]

        return docs[:top_k]

    async def delete(self, collection: str, doc_id: str):
        """Delete a document from a collection."""
        if collection in self._collections:
            self._collections[collection] = [
                d for d in self._collections[collection] if d["id"] != doc_id
            ]

    def stats(self) -> Dict[str, Any]:
        """Return vector store statistics."""
        return {
            "backend": self.backend,
            "collections": {
                name: len(docs) for name, docs in self._collections.items()
            },
            "total_documents": sum(len(d) for d in self._collections.values()),
        }


class EmbeddingService:
    """
    Generates text embeddings using OpenAI, local models, or Cloudflare AI.
    """

    def __init__(self, provider: str = "openai", model: str = "text-embedding-3-small"):
        self.provider = provider
        self.model = model
        self.dimension = 1536 if "3-small" in model else 3072

    async def embed(self, text: str) -> List[float]:
        """Generate embedding for a single text."""
        # Placeholder: returns zero vector
        # In production, calls OpenAI/Cloudflare AI embedding API
        return [0.0] * self.dimension

    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts."""
        return [await self.embed(t) for t in texts]


class KnowledgeSystem:
    """
    High-level knowledge system that combines vector search
    with document parsing and retrieval.
    """

    # Pre-defined knowledge sources
    SOURCES = {
        "fhir": {
            "name": "FHIR R4 Documentation",
            "collection": "fhir_docs",
            "description": "HL7 FHIR R4 specification and implementation guides",
        },
        "nphies": {
            "name": "NPHIES Specifications",
            "collection": "nphies_specs",
            "description": "Saudi NPHIES platform specifications and rules",
        },
        "brainsait": {
            "name": "BrainSAIT Documentation",
            "collection": "brainsait_docs",
            "description": "Platform documentation, runbooks, and operational guides",
        },
        "research": {
            "name": "Research Papers",
            "collection": "research_papers",
            "description": "Medical and healthcare technology research papers",
        },
        "sbs": {
            "name": "SBS Coding Reference",
            "collection": "sbs_codes",
            "description": "Saudi Billing System coding reference and mapping",
        },
    }

    def __init__(self, vector_client: Optional[VectorClient] = None):
        self.vector = vector_client or VectorClient()
        self.embedder = EmbeddingService()

    async def initialize(self):
        """Initialize knowledge collections."""
        await self.vector.connect()
        for source in self.SOURCES.values():
            await self.vector.create_collection(source["collection"])

    async def index_document(
        self,
        source: str,
        doc_id: str,
        text: str,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """Index a document into the knowledge base."""
        source_config = self.SOURCES.get(source)
        if not source_config:
            raise ValueError(f"Unknown source: {source}")

        embedding = await self.embedder.embed(text)
        await self.vector.upsert(
            collection=source_config["collection"],
            doc_id=doc_id,
            text=text,
            embedding=embedding,
            metadata={**(metadata or {}), "source": source},
        )

    async def search(
        self,
        query: str,
        sources: Optional[List[str]] = None,
        top_k: int = 5,
    ) -> Dict[str, Any]:
        """Search across knowledge sources."""
        target_sources = sources or list(self.SOURCES.keys())
        all_results = []

        for source in target_sources:
            source_config = self.SOURCES.get(source)
            if not source_config:
                continue

            results = await self.vector.search(
                collection=source_config["collection"],
                query_text=query,
                top_k=top_k,
            )
            for r in results:
                r["source_name"] = source_config["name"]
            all_results.extend(results)

        # Sort by score
        all_results.sort(key=lambda x: x.get("score", 0), reverse=True)

        return {
            "query": query,
            "results": all_results[:top_k],
            "sources_searched": len(target_sources),
            "total_matches": len(all_results),
        }

    def list_sources(self) -> List[Dict[str, str]]:
        """List available knowledge sources."""
        return [
            {"key": k, **{kk: vv for kk, vv in v.items() if kk != "collection"}}
            for k, v in self.SOURCES.items()
        ]
