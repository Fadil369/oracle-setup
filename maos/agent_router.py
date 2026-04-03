"""
MAOS Agent Router
Selects the appropriate agent team for a given task.
"""

import logging
from typing import Any, Dict, List

from .agent_registry import AgentDefinition, AgentRegistry

logger = logging.getLogger("maos.agent_router")

# Task type → required team roles mapping
TASK_TEAM_MAP: Dict[str, List[str]] = {
    # Healthcare
    "clinical_assessment": ["clinical", "nursing", "risk_analysis"],
    "hospital_simulation": ["patient_sim", "nursing", "clinical", "lab", "consultant", "risk_analysis"],
    "triage": ["nursing", "clinical"],
    "diagnosis": ["clinical", "lab", "consultant"],

    # Claims & Revenue
    "claims_processing": ["claims", "compliance", "coding"],
    "claims_appeal": ["claims", "compliance", "documentation"],
    "eligibility_check": ["claims", "compliance"],
    "coding_review": ["coding", "compliance"],

    # Research
    "research_analysis": ["literature", "hypothesis", "critic", "experiment"],
    "literature_review": ["literature", "critic"],
    "hypothesis_generation": ["hypothesis", "experiment"],

    # Infrastructure
    "server_management": ["devops", "monitoring"],
    "deployment": ["devops"],
    "monitoring": ["monitoring", "devops"],

    # Knowledge
    "knowledge_retrieval": ["knowledge"],
    "document_analysis": ["knowledge", "compliance"],

    # Media
    "video_processing": ["media"],
    "transcription": ["media"],

    # General
    "general": ["knowledge"],
    "startup_advisory": ["startup_advisor", "knowledge"],
}


class AgentRouter:
    """
    Routes tasks to the appropriate agent team based on task type
    and available agents.
    """

    def __init__(self, registry: AgentRegistry):
        self.registry = registry

    async def select_team(
        self, task_type: str, payload: Dict[str, Any]
    ) -> List[AgentDefinition]:
        """
        Select the best agent team for the given task.
        Falls back to capability matching if no explicit mapping exists.
        """
        # Check explicit task-team mapping
        required_roles = TASK_TEAM_MAP.get(task_type, [])

        if required_roles:
            team = []
            for role in required_roles:
                agents = self.registry.get_by_team_role(role)
                if agents:
                    # Pick the highest priority agent for this role
                    best = sorted(agents, key=lambda a: a.priority)[0]
                    if best not in team:
                        team.append(best)
            if team:
                logger.info(
                    "Routed task '%s' to team: %s",
                    task_type,
                    [a.name for a in team],
                )
                return team

        # Fallback: capability-based matching
        team = self.registry.get_by_capability(task_type)
        if team:
            logger.info(
                "Capability-matched task '%s' to: %s",
                task_type,
                [a.name for a in team],
            )
            return team[:5]  # Limit team size

        # Last resort: use knowledge agent
        knowledge_agents = self.registry.get_by_team_role("knowledge")
        if knowledge_agents:
            return knowledge_agents[:1]

        logger.warning("No agents found for task type: %s", task_type)
        return []

    async def assemble_team(
        self, role_names: List[str]
    ) -> List[AgentDefinition]:
        """Explicitly assemble a team by agent names or roles."""
        team = []
        for name in role_names:
            agent = self.registry.get(name)
            if agent:
                team.append(agent)
            else:
                # Try by role
                matches = self.registry.get_by_role(name)
                if matches:
                    team.append(matches[0])
        return team

    def get_routing_table(self) -> Dict[str, List[str]]:
        """Return the current task-to-team routing table."""
        return TASK_TEAM_MAP.copy()
