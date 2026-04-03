"""
MAOS Task Engine
Executes agent workflows with pipeline-style orchestration.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .agent_registry import AgentDefinition

logger = logging.getLogger("maos.task_engine")


class TaskResult:
    """Container for task execution results."""

    def __init__(self):
        self.steps: List[Dict[str, Any]] = []
        self.status: str = "pending"
        self.error: Optional[str] = None
        self.started_at: Optional[str] = None
        self.completed_at: Optional[str] = None

    def add_step(self, agent_name: str, output: Any, duration_ms: float = 0):
        self.steps.append({
            "agent": agent_name,
            "output": output,
            "duration_ms": round(duration_ms, 2),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status,
            "steps": self.steps,
            "error": self.error,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "total_steps": len(self.steps),
        }


class TaskEngine:
    """
    Executes multi-agent workflows in sequential pipeline mode.
    Each agent in the team processes the payload in order,
    with the output of one feeding into the next.
    """

    def __init__(self):
        self.completed_count = 0
        self.failed_count = 0
        self._active_tasks: Dict[str, TaskResult] = {}

    async def execute(
        self,
        task_id: str,
        team: List[AgentDefinition],
        payload: Dict[str, Any],
        context: Dict[str, Any],
        priority: str = "normal",
    ) -> Dict[str, Any]:
        """
        Execute a task through a pipeline of agents.
        Each agent receives the accumulated context from previous steps.
        """
        result = TaskResult()
        result.started_at = datetime.now(timezone.utc).isoformat()
        self._active_tasks[task_id] = result

        accumulated_context = {
            "task_id": task_id,
            "priority": priority,
            "original_payload": payload,
            "agent_outputs": {},
            **context,
        }

        try:
            for agent in team:
                step_start = asyncio.get_event_loop().time()

                # Each agent processes with accumulated context
                agent_output = await self._execute_agent(
                    agent, payload, accumulated_context
                )

                step_duration = (
                    asyncio.get_event_loop().time() - step_start
                ) * 1000

                result.add_step(agent.name, agent_output, step_duration)
                accumulated_context["agent_outputs"][agent.name] = agent_output

                # If agent signals an error, optionally halt
                if isinstance(agent_output, dict) and agent_output.get("halt"):
                    logger.warning(
                        "Agent %s halted pipeline for task %s",
                        agent.name,
                        task_id,
                    )
                    break

            result.status = "completed"
            result.completed_at = datetime.now(timezone.utc).isoformat()
            self.completed_count += 1

        except Exception as e:
            result.status = "failed"
            result.error = str(e)
            result.completed_at = datetime.now(timezone.utc).isoformat()
            self.failed_count += 1
            logger.error("Task %s failed: %s", task_id, e)

        finally:
            self._active_tasks.pop(task_id, None)

        return result.to_dict()

    async def _execute_agent(
        self,
        agent: AgentDefinition,
        payload: Dict[str, Any],
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Execute a single agent's processing step.
        In production, this calls the LLM/tool pipeline.
        Currently returns a structured placeholder.
        """
        logger.info("Executing agent: %s (%s)", agent.name, agent.role)

        # Build the agent's execution frame
        return {
            "agent": agent.name,
            "role": agent.role,
            "model": agent.model,
            "tools_available": agent.tools,
            "analysis": f"[{agent.name}] processed task with {len(agent.tools)} tools",
            "status": "completed",
        }

    def get_active_tasks(self) -> Dict[str, Any]:
        """Return currently executing tasks."""
        return {
            tid: r.to_dict() for tid, r in self._active_tasks.items()
        }
