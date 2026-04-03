"""
BrainSAIT MAOS API Gateway
FastAPI service that exposes the MAOS orchestrator, hospital simulation,
research lab, and Telegram bot as REST endpoints.

Run: uvicorn maos.api_gateway:app --host 0.0.0.0 --port 8000
"""

import logging
import os
from contextlib import asynccontextmanager
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .orchestrator import MAOSOrchestrator

logger = logging.getLogger("maos.api_gateway")


# ── Lifespan ─────────────────────────────────────────────────────────────

orchestrator = MAOSOrchestrator(config={
    "agents_dir": os.environ.get("AGENTS_DIR", "agents"),
    "registry_file": os.environ.get("AGENT_REGISTRY_FILE", "maos/registry/agents.masterlinc.yaml"),
    "memory_backend": os.environ.get("MEMORY_BACKEND", "local"),
})


@asynccontextmanager
async def lifespan(app: FastAPI):
    await orchestrator.start()
    yield
    await orchestrator.stop()


# ── App ──────────────────────────────────────────────────────────────────

app = FastAPI(
    title="BrainSAIT MAOS API",
    description="Multi-Agent Operating System for BrainSAIT Healthcare Platform v5.0",
    version="5.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://brainsait.org", "https://portals.brainsait.org"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ───────────────────────────────────────────────────────────────

class TaskRequest(BaseModel):
    task_type: str
    payload: Dict[str, Any] = {}
    priority: str = "normal"
    requester: str = "api"


class SimulationRequest(BaseModel):
    scenario_id: Optional[str] = None
    custom_patient: Optional[Dict[str, Any]] = None


class ResearchRequest(BaseModel):
    question: str
    context: str = ""
    max_sources: int = 10


class TelegramWebhook(BaseModel):
    update_id: int = 0
    message: Optional[Dict[str, Any]] = None


class MCPInvokeRequest(BaseModel):
    method: str
    agent: Optional[str] = None
    params: Dict[str, Any] = {}
    context: Dict[str, Any] = {}


# ── Endpoints ────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "platform": "BrainSAIT eCarePlus",
        "system": "MAOS — Multi-Agent Operating System",
        "version": "5.0.0",
        "status": "operational",
        "endpoints": {
            "status": "/status",
            "submit_task": "POST /task",
            "simulate": "POST /simulate",
            "research": "POST /research",
            "agents": "/agents",
            "telegram": "POST /telegram/webhook",
            "mcp_tools": "/mcp/tools",
            "mcp_invoke": "POST /mcp/invoke",
            "mcp_agents": "/mcp/agents",
        },
    }


@app.get("/status")
async def status():
    return orchestrator.status()


@app.get("/agents")
async def list_agents():
    return {
        "agents": orchestrator.registry.list_all(),
        "total": len(orchestrator.registry.agents),
    }


@app.post("/task")
async def submit_task(req: TaskRequest):
    result = await orchestrator.submit_task(
        task_type=req.task_type,
        payload=req.payload,
        priority=req.priority,
        requester=req.requester,
    )
    return result


@app.post("/simulate")
async def simulate_hospital(req: SimulationRequest):
    try:
        from scenarios.hospital_simulation import HospitalSimulation
        sim = HospitalSimulation()
        result = await sim.run(
            scenario_id=req.scenario_id,
            custom_patient=req.custom_patient,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/research")
async def research_analyze(req: ResearchRequest):
    try:
        from scenarios.research_lab import ResearchLab
        lab = ResearchLab()
        result = await lab.analyze(
            research_question=req.question,
            context=req.context,
            max_sources=req.max_sources,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/telegram/webhook")
async def telegram_webhook(req: TelegramWebhook):
    try:
        from telegram.bot import TelegramBot
        token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
        bot = TelegramBot(token=token, orchestrator=orchestrator)
        result = await bot.handle_webhook(req.dict())
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    return {
        "platform": "BrainSAIT eCarePlus",
        "version": "5.0.0",
        "status": "operational",
        "agents": len(orchestrator.registry.agents),
        "hospitals": 6,
        "compliance": {
            "hipaa": True,
            "pdpl": True,
            "nphies": True,
            "fhir_r4": True,
        },
    }


# ── MCP (Model Context Protocol) endpoints ──────────────────────────────

@app.get("/mcp/tools")
async def mcp_list_tools():
    """List all available MCP tools from registered agents."""
    tools = []
    for agent in orchestrator.registry.list_all():
        for tool in agent.get("tools", []):
            tools.append({
                "name": tool,
                "agent": agent["name"],
                "domain": agent.get("domain", "general"),
                "priority": agent.get("priority", 3),
            })
    return {
        "jsonrpc": "2.0",
        "result": {"tools": tools, "total": len(tools)},
    }


@app.post("/mcp/invoke")
async def mcp_invoke(req: MCPInvokeRequest):
    """
    MasterLinc MCP gateway — invoke agent capabilities via Model Context Protocol.
    Routes to the appropriate agent (ClinicalLinc, ClaimLinc, etc.) using the registry.
    """
    # Resolve target agent
    target = None
    if req.agent:
        target = orchestrator.registry.get_by_name_or_alias(req.agent)

    if not target:
        # Attempt capability-based routing
        candidates = orchestrator.registry.get_by_capability(req.method)
        if candidates:
            target = candidates[0]

    if not target:
        raise HTTPException(
            status_code=404,
            detail=f"No agent found for method '{req.method}' or agent '{req.agent}'",
        )

    result = await orchestrator.submit_task(
        task_type=req.method,
        payload={**req.params, "mcp_context": req.context},
        priority="normal",
        requester="mcp-gateway",
    )
    return {
        "jsonrpc": "2.0",
        "result": result,
        "agent": target.name if hasattr(target, "name") else str(target),
    }


@app.get("/mcp/agents")
async def mcp_agents():
    """List agents with their MCP-compatible capability declarations."""
    agents = []
    for agent in orchestrator.registry.list_all():
        agents.append({
            "name": agent["name"],
            "role": agent.get("role", ""),
            "capabilities": agent.get("capabilities", []),
            "tools": agent.get("tools", []),
            "domain": agent.get("domain", "general"),
            "enabled": agent.get("enabled", True),
            "priority": agent.get("priority", 3),
        })
    return {
        "jsonrpc": "2.0",
        "result": {"agents": agents, "total": len(agents)},
    }
