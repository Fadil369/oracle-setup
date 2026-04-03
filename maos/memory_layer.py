"""
MAOS Memory Layer
Shared context and state management across agent teams.
Supports local (in-memory) and external (Redis/KV) backends.
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("maos.memory_layer")


class MemoryLayer:
    """
    Provides shared memory across agent teams.
    Supports conversation history, task context, and knowledge retrieval.
    """

    def __init__(self, backend: str = "local"):
        self.backend = backend
        self._store: Dict[str, Dict[str, Any]] = {}
        self._conversations: Dict[str, List[Dict[str, Any]]] = {}
        self._connected = False

    async def connect(self):
        """Initialize the memory backend."""
        if self.backend == "local":
            self._connected = True
            logger.info("Memory layer connected (local backend)")
        elif self.backend == "redis":
            # Future: Redis connection
            self._connected = True
            logger.info("Memory layer connected (redis backend)")
        elif self.backend == "kv":
            # Future: Cloudflare KV connection
            self._connected = True
            logger.info("Memory layer connected (KV backend)")
        else:
            self._connected = True
            logger.warning("Unknown backend '%s', using local", self.backend)

    async def disconnect(self):
        """Gracefully close the memory backend."""
        self._connected = False
        logger.info("Memory layer disconnected")

    async def create_context(
        self, task_id: str, initial_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create a new task context."""
        context = {
            "task_id": task_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            **initial_data,
        }
        self._store[task_id] = context
        return context

    async def get_context(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a task context."""
        return self._store.get(task_id)

    async def update_context(
        self, task_id: str, updates: Dict[str, Any]
    ):
        """Update an existing task context."""
        if task_id in self._store:
            self._store[task_id].update(updates)
            self._store[task_id]["updated_at"] = (
                datetime.now(timezone.utc).isoformat()
            )

    async def store_result(
        self, task_id: str, result: Dict[str, Any]
    ):
        """Persist a task result."""
        if task_id in self._store:
            self._store[task_id]["result"] = result
            self._store[task_id]["completed_at"] = (
                datetime.now(timezone.utc).isoformat()
            )

    # ── Conversation Memory ──────────────────────────────────────

    async def add_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """Add a message to a conversation."""
        if conversation_id not in self._conversations:
            self._conversations[conversation_id] = []

        self._conversations[conversation_id].append({
            "role": role,
            "content": content,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "metadata": metadata or {},
        })

    async def get_conversation(
        self, conversation_id: str, limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Retrieve conversation history."""
        messages = self._conversations.get(conversation_id, [])
        return messages[-limit:]

    async def clear_conversation(self, conversation_id: str):
        """Clear conversation history."""
        self._conversations.pop(conversation_id, None)

    # ── Knowledge Retrieval ──────────────────────────────────────

    async def store_knowledge(
        self, key: str, value: Any, namespace: str = "default"
    ):
        """Store a knowledge item."""
        ns_key = f"knowledge:{namespace}:{key}"
        self._store[ns_key] = {
            "value": value,
            "namespace": namespace,
            "stored_at": datetime.now(timezone.utc).isoformat(),
        }

    async def retrieve_knowledge(
        self, key: str, namespace: str = "default"
    ) -> Optional[Any]:
        """Retrieve a knowledge item."""
        ns_key = f"knowledge:{namespace}:{key}"
        entry = self._store.get(ns_key)
        return entry["value"] if entry else None

    # ── Stats ────────────────────────────────────────────────────

    def stats(self) -> Dict[str, Any]:
        """Return memory layer statistics."""
        return {
            "backend": self.backend,
            "connected": self._connected,
            "contexts": len(
                [k for k in self._store if not k.startswith("knowledge:")]
            ),
            "knowledge_items": len(
                [k for k in self._store if k.startswith("knowledge:")]
            ),
            "conversations": len(self._conversations),
            "total_messages": sum(
                len(v) for v in self._conversations.values()
            ),
        }
