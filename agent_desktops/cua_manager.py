"""
BrainSAIT Agent Desktops (Cua)
Virtual desktop virtualization layer for AI agents.

Each AI agent can launch its own virtual workstation with:
- Isolated browser environment
- Development tools
- Research interfaces
- VNC access

Desktop templates define the configuration for each agent type.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("agent_desktops.cua_manager")


class DesktopTemplate:
    """Configuration template for an agent desktop."""

    def __init__(self, config: Dict[str, Any]):
        self.name: str = config.get("name", "default")
        self.base_image: str = config.get("base_image", "brainsait/agent-desktop:latest")
        self.resolution: str = config.get("resolution", "1920x1080")
        self.memory_mb: int = config.get("memory_mb", 2048)
        self.cpu_cores: int = config.get("cpu_cores", 2)
        self.tools: List[str] = config.get("tools", [])
        self.ports: Dict[str, int] = config.get("ports", {"vnc": 6901, "agent": 8000})
        self.env_vars: Dict[str, str] = config.get("env_vars", {})
        self.persistent_storage: bool = config.get("persistent_storage", False)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "base_image": self.base_image,
            "resolution": self.resolution,
            "memory_mb": self.memory_mb,
            "cpu_cores": self.cpu_cores,
            "tools": self.tools,
            "ports": self.ports,
            "persistent_storage": self.persistent_storage,
        }


# Pre-defined desktop templates
DESKTOP_TEMPLATES: Dict[str, DesktopTemplate] = {
    "coding": DesktopTemplate({
        "name": "coding_desktop",
        "base_image": "brainsait/agent-desktop:coding",
        "resolution": "1920x1080",
        "memory_mb": 4096,
        "cpu_cores": 4,
        "tools": ["vscode", "terminal", "git", "node", "python", "docker"],
        "ports": {"vnc": 6901, "agent": 8000, "dev": 3000},
        "persistent_storage": True,
    }),
    "research": DesktopTemplate({
        "name": "research_desktop",
        "base_image": "brainsait/agent-desktop:research",
        "resolution": "1920x1080",
        "memory_mb": 4096,
        "cpu_cores": 2,
        "tools": ["browser", "jupyter", "python", "r_studio", "zotero"],
        "ports": {"vnc": 6901, "agent": 8000, "jupyter": 8888},
        "persistent_storage": True,
    }),
    "clinical": DesktopTemplate({
        "name": "clinical_desktop",
        "base_image": "brainsait/agent-desktop:clinical",
        "resolution": "1920x1080",
        "memory_mb": 2048,
        "cpu_cores": 2,
        "tools": ["browser", "fhir_viewer", "dicom_viewer", "terminal"],
        "ports": {"vnc": 6901, "agent": 8000},
    }),
    "training": DesktopTemplate({
        "name": "training_desktop",
        "base_image": "brainsait/agent-desktop:training",
        "resolution": "1280x720",
        "memory_mb": 2048,
        "cpu_cores": 2,
        "tools": ["browser", "terminal", "documentation_viewer"],
        "ports": {"vnc": 6901, "agent": 8000},
    }),
}


class DesktopInstance:
    """Represents a running agent desktop instance."""

    def __init__(self, instance_id: str, agent_name: str, template: DesktopTemplate):
        self.instance_id = instance_id
        self.agent_name = agent_name
        self.template = template
        self.status = "starting"
        self.created_at = datetime.now(timezone.utc).isoformat()
        self.agent_url: Optional[str] = None
        self.vnc_url: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "instance_id": self.instance_id,
            "agent_name": self.agent_name,
            "template": self.template.name,
            "status": self.status,
            "created_at": self.created_at,
            "agent_url": self.agent_url,
            "vnc_url": self.vnc_url,
        }


class CuaManager:
    """
    Manages agent desktop instances.
    Creates, monitors, and terminates virtual workstations for AI agents.
    """

    def __init__(self, host: str = "localhost", base_port: int = 6901):
        self.host = host
        self.base_port = base_port
        self.instances: Dict[str, DesktopInstance] = {}
        self._next_port = base_port

    async def launch(
        self, agent_name: str, template_name: str = "coding"
    ) -> DesktopInstance:
        """Launch a new agent desktop."""
        template = DESKTOP_TEMPLATES.get(template_name)
        if not template:
            raise ValueError(f"Unknown template: {template_name}. Available: {list(DESKTOP_TEMPLATES.keys())}")

        instance_id = f"desktop-{agent_name}-{len(self.instances) + 1}"
        instance = DesktopInstance(instance_id, agent_name, template)

        # Assign ports
        vnc_port = self._next_port
        agent_port = self._next_port + 100
        self._next_port += 1

        instance.vnc_url = f"http://{self.host}:{vnc_port}/vnc.html"
        instance.agent_url = f"http://{self.host}:{agent_port}"
        instance.status = "running"

        self.instances[instance_id] = instance
        logger.info("Launched desktop %s for agent %s (template: %s)", instance_id, agent_name, template_name)

        return instance

    async def terminate(self, instance_id: str) -> bool:
        """Terminate a desktop instance."""
        instance = self.instances.pop(instance_id, None)
        if instance:
            instance.status = "terminated"
            logger.info("Terminated desktop %s", instance_id)
            return True
        return False

    async def terminate_all(self):
        """Terminate all running desktops."""
        for iid in list(self.instances.keys()):
            await self.terminate(iid)

    def get_instance(self, instance_id: str) -> Optional[DesktopInstance]:
        """Get a specific desktop instance."""
        return self.instances.get(instance_id)

    def list_instances(self) -> List[Dict[str, Any]]:
        """List all running desktop instances."""
        return [i.to_dict() for i in self.instances.values()]

    def list_templates(self) -> List[Dict[str, Any]]:
        """List available desktop templates."""
        return [t.to_dict() for t in DESKTOP_TEMPLATES.values()]

    def status(self) -> Dict[str, Any]:
        """Return desktop manager status."""
        return {
            "host": self.host,
            "running_instances": len(self.instances),
            "available_templates": list(DESKTOP_TEMPLATES.keys()),
            "instances": self.list_instances(),
        }
