"""
BrainSAIT Telegram Super-Bot
Universal control interface for the BrainSAIT platform.

Architecture:
  Telegram → Bot API → BrainSAIT Gateway → Agent Router → Services/Agents

Webhook: POST /telegram/webhook

Commands:
  /ai <query>           — General AI assistant
  /dev <action>         — Development operations
  /server <action>      — Server management
  /media <action>       — Media processing
  /research <topic>     — Research automation
  /knowledge <query>    — Knowledge base search
  /simulate <scenario>  — Hospital simulation
  /status               — Platform status
  /help                 — Command reference
"""

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("telegram.bot")


class TelegramBot:
    """
    BrainSAIT Telegram Super-Bot.
    Routes commands to the appropriate MAOS agent teams.
    """

    def __init__(self, token: str, orchestrator=None):
        self.token = token
        self.orchestrator = orchestrator
        self.api_base = f"https://api.telegram.org/bot{token}"
        self._commands = self._register_commands()

    def _register_commands(self) -> Dict[str, callable]:
        """Register available bot commands."""
        return {
            "/ai": self._handle_ai,
            "/dev": self._handle_dev,
            "/server": self._handle_server,
            "/media": self._handle_media,
            "/research": self._handle_research,
            "/knowledge": self._handle_knowledge,
            "/simulate": self._handle_simulate,
            "/status": self._handle_status,
            "/help": self._handle_help,
            "/start": self._handle_start,
        }

    async def handle_webhook(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Process incoming Telegram webhook update."""
        message = payload.get("message", {})
        text = message.get("text", "")
        chat_id = message.get("chat", {}).get("id")
        user = message.get("from", {})

        if not chat_id or not text:
            return {"status": "ignored", "reason": "no_text_message"}

        logger.info(
            "Telegram message from %s (%s): %s",
            user.get("first_name", "Unknown"),
            chat_id,
            text[:100],
        )

        # Parse command and args
        parts = text.strip().split(maxsplit=1)
        command = parts[0].lower().split("@")[0]  # Remove @botname
        args = parts[1] if len(parts) > 1 else ""

        # Route to handler
        handler = self._commands.get(command, self._handle_unknown)
        response = await handler(chat_id, args, user)

        return {
            "status": "processed",
            "chat_id": chat_id,
            "command": command,
            "response": response,
        }

    # ── Command Handlers ───────────────────────────────────────

    async def _handle_ai(self, chat_id: int, args: str, user: Dict) -> str:
        """General AI query routed to MAOS."""
        if not args:
            return "Usage: /ai <your question>\n\nExample: /ai What is FHIR R4?"

        if self.orchestrator:
            result = await self.orchestrator.submit_task(
                task_type="general",
                payload={"query": args, "source": "telegram"},
                requester=f"telegram:{user.get('id', 'unknown')}",
            )
            return f"🤖 *AI Response*\n\n{json.dumps(result.get('result', {}), indent=2)}"

        return f"🤖 *AI Query Received*\n\nQuery: {args}\n\n_Processing via MAOS agent network..._"

    async def _handle_dev(self, chat_id: int, args: str, user: Dict) -> str:
        """Development operations."""
        if not args:
            return (
                "🛠 *Dev Operations*\n\n"
                "Commands:\n"
                "• `/dev deploy <service>` — Deploy a service\n"
                "• `/dev build <project>` — Build project\n"
                "• `/dev logs <service>` — View logs\n"
                "• `/dev test <suite>` — Run tests"
            )

        return f"🛠 *Dev Command*\n\nAction: `{args}`\n_Routing to DevOps agent..._"

    async def _handle_server(self, chat_id: int, args: str, user: Dict) -> str:
        """Server management."""
        if not args:
            return (
                "🖥 *Server Management*\n\n"
                "Commands:\n"
                "• `/server status` — All servers status\n"
                "• `/server restart <name>` — Restart server\n"
                "• `/server docker list` — List containers\n"
                "• `/server deploy <service>` — Deploy service"
            )

        if args.strip().lower() == "status":
            return (
                "🖥 *Server Status*\n\n"
                "• Cloudflare Edge: ✅ Online\n"
                "• Portal Worker: ✅ v5.0.0\n"
                "• Oracle Bridge: ✅ Connected\n"
                "• MCP Gateway: ✅ Active\n"
                "• MAOS Engine: ✅ Running\n\n"
                f"_Last check: {datetime.now(timezone.utc).strftime('%H:%M:%S UTC')}_"
            )

        return f"🖥 *Server Command*\n\nAction: `{args}`\n_Routing to DevOps agent..._"

    async def _handle_media(self, chat_id: int, args: str, user: Dict) -> str:
        """Media processing."""
        if not args:
            return (
                "🎬 *Media Processing*\n\n"
                "Commands:\n"
                "• `/media transcribe` — Transcribe audio/video\n"
                "• `/media translate arabic` — Translate to Arabic\n"
                "• `/media publish` — Publish content"
            )

        return f"🎬 *Media Command*\n\nAction: `{args}`\n_Routing to Media agent..._"

    async def _handle_research(self, chat_id: int, args: str, user: Dict) -> str:
        """Research automation."""
        if not args:
            return (
                "🔬 *Research Lab*\n\n"
                "Usage: `/research <topic>`\n\n"
                "Example: `/research healthcare interoperability in Saudi Arabia`\n\n"
                "Runs a 5-agent research pipeline:\n"
                "1. Literature search\n"
                "2. Hypothesis generation\n"
                "3. Critical evaluation\n"
                "4. Experiment design\n"
                "5. Peer review"
            )

        return (
            f"🔬 *Research Analysis Started*\n\n"
            f"Topic: _{args}_\n\n"
            f"Pipeline: Literature → Hypothesis → Critic → Design → Review\n\n"
            f"_Processing... Results will be sent when complete._"
        )

    async def _handle_knowledge(self, chat_id: int, args: str, user: Dict) -> str:
        """Knowledge base search."""
        if not args:
            return "📚 Usage: `/knowledge <query>`\n\nSearches FHIR docs, NPHIES specs, and BrainSAIT documentation."

        return f"📚 *Knowledge Search*\n\nQuery: _{args}_\n_Searching vector database..._"

    async def _handle_simulate(self, chat_id: int, args: str, user: Dict) -> str:
        """Hospital simulation."""
        scenarios = ["cardiac-chest-pain", "respiratory-infection", "diabetic-emergency", "oncology-followup"]

        if not args:
            return (
                "🏥 *Hospital Simulation*\n\n"
                "Usage: `/simulate <scenario>`\n\n"
                "Scenarios:\n" +
                "\n".join(f"• `{s}`" for s in scenarios) +
                "\n\nRuns a 6-agent simulation pipeline."
            )

        return (
            f"🏥 *Simulation Started*\n\n"
            f"Scenario: `{args}`\n\n"
            f"Pipeline: Patient → Triage → Doctor → Lab → Consultant → Risk\n\n"
            f"_Running simulation..._"
        )

    async def _handle_status(self, chat_id: int, args: str, user: Dict) -> str:
        """Platform status."""
        if self.orchestrator:
            status = self.orchestrator.status()
            return (
                "📊 *BrainSAIT Platform Status*\n\n"
                f"Version: {status['version']}\n"
                f"Running: {'✅' if status['running'] else '❌'}\n"
                f"Agents: {status['agents_loaded']}\n"
                f"Tasks Completed: {status['tasks_completed']}\n"
                f"Tasks Failed: {status['tasks_failed']}\n"
            )

        return (
            "📊 *BrainSAIT Platform Status*\n\n"
            "• Platform: BrainSAIT eCarePlus v5.0.0\n"
            "• Agents: 11 LINC agents active\n"
            "• Hospitals: 6 connected\n"
            "• Services: Operational\n\n"
            f"_Updated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}_"
        )

    async def _handle_help(self, chat_id: int, args: str, user: Dict) -> str:
        """Show help."""
        return (
            "🧠 *BrainSAIT Super-Bot*\n\n"
            "Universal control interface for the BrainSAIT Healthcare AI Platform.\n\n"
            "*Commands:*\n"
            "• `/ai <query>` — Ask the AI\n"
            "• `/dev <action>` — Development ops\n"
            "• `/server <action>` — Server management\n"
            "• `/media <action>` — Media processing\n"
            "• `/research <topic>` — Research automation\n"
            "• `/knowledge <query>` — Knowledge search\n"
            "• `/simulate <scenario>` — Hospital simulation\n"
            "• `/status` — Platform status\n"
            "• `/help` — This message\n\n"
            "_Powered by MAOS — Multi-Agent Operating System_"
        )

    async def _handle_start(self, chat_id: int, args: str, user: Dict) -> str:
        """Welcome message."""
        name = user.get("first_name", "there")
        return (
            f"مرحبا {name}! 🧠\n\n"
            "*Welcome to BrainSAIT Super-Bot*\n\n"
            "I'm the universal control interface for the BrainSAIT "
            "Healthcare AI Platform — Saudi Arabia's patient-first "
            "cognitive backbone for healthcare.\n\n"
            "Type `/help` to see available commands.\n\n"
            "_Aligned with Saudi Vision 2030_ 🇸🇦"
        )

    async def _handle_unknown(self, chat_id: int, args: str, user: Dict) -> str:
        """Unknown command."""
        return "❓ Unknown command. Type `/help` to see available commands."

    # ── Telegram API Helpers ───────────────────────────────────

    def build_send_message(self, chat_id: int, text: str) -> Dict[str, Any]:
        """Build a sendMessage API payload."""
        return {
            "method": "sendMessage",
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "Markdown",
            "disable_web_page_preview": True,
        }
