"""
MAOS — Multi-Agent Operating System
Orchestrator: coordinates agent teams, routes tasks, manages lifecycle.

BrainSAIT Healthcare AI Operating System
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .agent_registry import AgentRegistry
from .agent_router import AgentRouter
from .task_engine import TaskEngine
from .memory_layer import MemoryLayer

logger = logging.getLogger("maos.orchestrator")


class MAOSOrchestrator:
    """
    Central orchestrator for the Multi-Agent Operating System.
    Coordinates agent teams, routes tasks, and manages the agent lifecycle.
    """

    VERSION = "5.0.0"
    PLATFORM = "BrainSAIT eCarePlus"

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.registry = AgentRegistry(
            agents_dir=self.config.get("agents_dir", "agents"),
            registry_file=self.config.get("registry_file"),
        )
        self.router = AgentRouter(registry=self.registry)
        self.task_engine = TaskEngine()
        self.memory = MemoryLayer(
            backend=self.config.get("memory_backend", "local")
        )
        self._running = False
        self._start_time: Optional[datetime] = None
        logger.info("MAOS Orchestrator initialized (v%s)", self.VERSION)

    async def start(self):
        """Boot the orchestrator and load all registered agents."""
        self._running = True
        self._start_time = datetime.now(timezone.utc)
        await self.registry.load_all()
        await self.memory.connect()
        logger.info(
            "MAOS started — %d agents loaded", len(self.registry.agents)
        )

    async def stop(self):
        """Gracefully shut down the orchestrator."""
        self._running = False
        await self.memory.disconnect()
        logger.info("MAOS stopped")

    async def submit_task(
        self,
        task_type: str,
        payload: Dict[str, Any],
        priority: str = "normal",
        requester: str = "system",
    ) -> Dict[str, Any]:
        """
        Submit a task to the orchestrator.
        The router selects the appropriate agent team, and the task engine
        executes the workflow.
        """
        task_id = f"task-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{id(payload) % 10000:04d}"

        # Route to the right agent team
        team = await self.router.select_team(task_type, payload)

        # Create execution context with shared memory
        context = await self.memory.create_context(task_id, {
            "task_type": task_type,
            "payload": payload,
            "team": [a.name for a in team],
            "requester": requester,
            "started_at": datetime.now(timezone.utc).isoformat(),
        })

        # Execute via the task engine
        result = await self.task_engine.execute(
            task_id=task_id,
            team=team,
            payload=payload,
            context=context,
            priority=priority,
        )

        # Persist result in memory
        await self.memory.store_result(task_id, result)

        return {
            "task_id": task_id,
            "status": result.get("status", "completed"),
            "team": [a.name for a in team],
            "result": result,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }

    async def assemble_team(
        self, roles: List[str]
    ) -> List[Any]:
        """Dynamically assemble a team of agents by role names."""
        return await self.router.assemble_team(roles)

    def status(self) -> Dict[str, Any]:
        """Return orchestrator health and status."""
        uptime = None
        if self._start_time:
            uptime = (
                datetime.now(timezone.utc) - self._start_time
            ).total_seconds()

        return {
            "platform": self.PLATFORM,
            "version": self.VERSION,
            "running": self._running,
            "uptime_seconds": uptime,
            "agents_loaded": len(self.registry.agents),
            "agent_names": list(self.registry.agents.keys()),
            "registry_file": str(self.registry.registry_file) if self.registry.registry_file else None,
            "agents_dir": str(self.registry.agents_dir),
            "memory_backend": self.memory.backend,
            "tasks_completed": self.task_engine.completed_count,
            "tasks_failed": self.task_engine.failed_count,
        }

    async def handle_webhook(
        self, source: str, payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Handle incoming webhooks from external systems
        (Telegram, n8n, API gateway).
        """
        task_type = payload.get("task_type", "general")
        return await self.submit_task(
            task_type=task_type,
            payload=payload,
            requester=source,
        )
