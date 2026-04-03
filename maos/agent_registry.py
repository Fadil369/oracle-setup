"""
MAOS Agent Registry
Discovers, loads, and manages agents from YAML definitions.
"""

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("maos.agent_registry")

try:
    import yaml
except ImportError:
    yaml = None


class AgentDefinition:
    """Represents a loaded agent from YAML configuration."""

    def __init__(self, config: Dict[str, Any]):
        self.name: str = config.get("name", "unnamed_agent")
        self.role: str = config.get("role", "General purpose agent")
        self.description: str = config.get("description", "")
        self.tools: List[str] = config.get("tools", [])
        self.memory: str = config.get("memory", "default")
        self.model: str = config.get("model", "gpt-4o")
        self.temperature: float = config.get("temperature", 0.3)
        self.system_prompt: str = config.get("system_prompt", "")
        self.capabilities: List[str] = config.get("capabilities", [])
        self.team_roles: List[str] = config.get("team_roles", [])
        self.priority: int = config.get("priority", 5)
        self.enabled: bool = config.get("enabled", True)
        self.metadata: Dict[str, Any] = config.get("metadata", {})
        self.aliases: List[str] = config.get("aliases", [])
        self.legacy_roles: List[str] = config.get("legacy_roles", [])
        self.domain: str = config.get("domain", "general")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "role": self.role,
            "description": self.description,
            "tools": self.tools,
            "memory": self.memory,
            "model": self.model,
            "capabilities": self.capabilities,
            "team_roles": self.team_roles,
            "priority": self.priority,
            "enabled": self.enabled,
            "aliases": self.aliases,
            "legacy_roles": self.legacy_roles,
            "domain": self.domain,
        }

    def __repr__(self):
        return f"<Agent:{self.name} role={self.role}>"


class AgentRegistry:
    """
    Discovers and loads agent definitions from YAML files.
    Supports dynamic agent assembly into teams.
    """

    LEGACY_ROLE_MAP: Dict[str, str] = {
        "openmaic_doctor": "doctorlinc",
        "openmaic_nurse": "nurselinc",
        "openmaic_claims": "claimlinc",
        "openmaic_compliance": "compliancelinc",
        "openmaic_knowledge": "knowledgelinc",
        "openmaic_research": "researchlinc",
        "openmaic_devops": "devopslinc",
        "clinical": "doctorlinc",
        "nursing": "nurselinc",
        "claims": "claimlinc",
        "compliance": "compliancelinc",
        "knowledge": "knowledgelinc",
    }

    def __init__(self, agents_dir: str = "agents", registry_file: Optional[str] = None):
        self.agents_dir = Path(agents_dir)
        self.registry_file = Path(registry_file) if registry_file else None
        self.agents: Dict[str, AgentDefinition] = {}

    async def load_all(self):
        """Scan the agents directory and load all YAML definitions."""
        self.agents.clear()

        if self.registry_file and self.registry_file.exists():
            self._load_from_path(self.registry_file)

        if not self.agents_dir.exists():
            if not self.agents:
                logger.warning("Agents directory not found: %s", self.agents_dir)
            return

        for yaml_file in sorted(self.agents_dir.glob("*.yaml")):
            self._load_from_path(yaml_file)

        # Also check .yml extension
        for yml_file in sorted(self.agents_dir.glob("*.yml")):
            self._load_from_path(yml_file)

        logger.info("Loaded %d agents from registry sources", len(self.agents))

    def _load_from_path(self, path: Path):
        try:
            agents = self._load_yaml(path)
            for agent in agents:
                if agent and agent.enabled:
                    self.agents[agent.name] = agent
        except Exception as e:
            logger.error("Failed to load agent %s: %s", path.name, e)

    def _load_yaml(self, path: Path) -> List[AgentDefinition]:
        """Load agent definitions from a YAML file."""
        if yaml is None:
            # Fallback: parse simple YAML manually (returns list with one item)
            fallback_agent = self._load_yaml_fallback(path)
            return [fallback_agent] if fallback_agent else []

        agents = []
        with open(path, "r", encoding="utf-8") as f:
            docs = yaml.safe_load_all(f)
            for doc in docs:
                if doc and isinstance(doc, dict):
                    if "agents" in doc and isinstance(doc["agents"], list):
                        for item in doc["agents"]:
                            if isinstance(item, dict):
                                agents.append(AgentDefinition(item))
                    else:
                        agents.append(AgentDefinition(doc))

        return agents

    def _load_yaml_fallback(self, path: Path) -> Optional[AgentDefinition]:
        """Basic YAML parser for environments without PyYAML."""
        config = {}
        current_list_key = None

        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                stripped = line.strip()
                if not stripped or stripped.startswith("#"):
                    continue

                if stripped.startswith("- "):
                    if current_list_key:
                        if current_list_key not in config:
                            config[current_list_key] = []
                        config[current_list_key].append(stripped[2:].strip())
                    continue

                if ":" in stripped:
                    key, _, value = stripped.partition(":")
                    key = key.strip()
                    value = value.strip()

                    if not value:
                        current_list_key = key
                    else:
                        current_list_key = None
                        # Handle booleans and numbers
                        if value.lower() in ("true", "yes"):
                            config[key] = True
                        elif value.lower() in ("false", "no"):
                            config[key] = False
                        else:
                            try:
                                config[key] = int(value)
                            except ValueError:
                                try:
                                    config[key] = float(value)
                                except ValueError:
                                    config[key] = value

        return AgentDefinition(config) if config else None

    def get(self, name: str) -> Optional[AgentDefinition]:
        """Get agent by name."""
        return self.agents.get(name)

    def get_by_name_or_alias(self, name: str) -> Optional[AgentDefinition]:
        """Get an agent by canonical name or alias."""
        candidate = name.lower()
        for agent in self.agents.values():
            if agent.name.lower() == candidate:
                return agent
            if any(a.lower() == candidate for a in agent.aliases):
                return agent
        return None

    def get_by_role(self, role_keyword: str) -> List[AgentDefinition]:
        """Find agents whose role contains the keyword."""
        keyword = role_keyword.lower()
        migrated = self.map_legacy_role(role_keyword)
        return [
            a for a in self.agents.values()
            if keyword in a.role.lower()
            or keyword in a.name.lower()
            or any(keyword in alias.lower() for alias in a.aliases)
            or any(keyword in lr.lower() for lr in a.legacy_roles)
            or migrated in a.name.lower()
            or migrated in a.role.lower()
        ]

    def get_by_capability(self, capability: str) -> List[AgentDefinition]:
        """Find agents that have a specific capability."""
        cap = capability.lower()
        return [
            a for a in self.agents.values()
            if any(cap in c.lower() for c in a.capabilities)
        ]

    def get_by_team_role(self, team_role: str) -> List[AgentDefinition]:
        """Find agents assigned to a specific team role."""
        role = team_role.lower()
        migrated = self.map_legacy_role(team_role)
        return [
            a for a in self.agents.values()
            if any(role in r.lower() for r in a.team_roles)
            or any(migrated in r.lower() for r in a.team_roles)
            or migrated in a.name.lower()
        ]

    def map_legacy_role(self, role_name: str) -> str:
        """Map an OpenMAIC/legacy role name to BrainSAIT Linc role naming."""
        key = role_name.strip().lower()
        return self.LEGACY_ROLE_MAP.get(key, key)

    def list_all(self) -> List[Dict[str, Any]]:
        """Return summary of all loaded agents."""
        return [a.to_dict() for a in self.agents.values()]
