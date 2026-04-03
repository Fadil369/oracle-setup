"""
MAOS — Multi-Agent Operating System
BrainSAIT Healthcare AI Operating System

Modules:
  orchestrator   — coordinates agents
  agent_router   — selects agent teams
  agent_registry — loads and manages agents
  task_engine    — executes workflows
  memory_layer   — shared context and state
"""

from .orchestrator import MAOSOrchestrator
from .agent_registry import AgentRegistry
from .agent_router import AgentRouter
from .task_engine import TaskEngine
from .memory_layer import MemoryLayer

__version__ = "5.0.0"
__all__ = [
    "MAOSOrchestrator",
    "AgentRegistry",
    "AgentRouter",
    "TaskEngine",
    "MemoryLayer",
]
