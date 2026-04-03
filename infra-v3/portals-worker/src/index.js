/**
 * brainsait.org — BrainSAIT Healthcare Control Tower v3.3
 * Cloudflare Worker
 *
 * FIXES from v2:
 *   FIX-1  Madinah shown as "Offline" → now live-probed (it's online)
 *   FIX-2  Khamis subdomain added (oracle-khamis.brainsait.org)
 *   FIX-3  Correct login paths per branch (Madinah/Abha use /Oasis/...)
 *   FIX-4  Health check is now LIVE (probes each tunnel URL on every request)
 *   FIX-5  Jizan: probe timeout set to 8s (it's slow, not dead)
 *   FIX-6  Added /api/health JSON endpoint for COMPLIANCELINC scanner
 *   FIX-7  Added /api/scan/:branch advisory endpoint with secure scanner passthrough
 *   FIX-8  API key auth enforced on /api/control-tower and authenticated /api/scan/:branch
 *   FIX-9  CORS preflight (OPTIONS) handler added
 *   FIX-10 Error boundary on public and control-tower HTML routes
 *   NEW    Cron trigger: health check every 5 min → stored in KV
 *
 * Routes:
 *   GET      /                     → BrainSAIT public landing HTML
 *   GET      /patient             → BSMA patient front door
 *   GET      /givc                → provider interface entry page
 *   GET      /sbs                 → payer interface entry page
 *   GET      /government          → government interface entry page
 *   GET      /control-tower       → operator dashboard HTML
 *   GET      /api/control-tower/summary → redacted lightweight snapshot (public)
 *   GET      /api/control-tower/details → redacted detailed snapshot (public)
 *   GET      /api/control-tower    → combined snapshot with internals (requires API key)
 *   GET      /api/infrastructure   → public infrastructure/service directory snapshot
 *   GET      /api/platform-apps    → public platform application summary
 *   GET/POST /api/deploy/oracle    → plan, validate, or trigger Oracle deployment (requires X-API-Key)
 *   GET      /api/runbooks         → runbook index for the action queue
 *   GET      /api/runbooks/:id     → runbook JSON detail
 *   GET/POST /api/scan/:branch     → public advisory or secure oracle-claim-scanner passthrough
 *   GET      /api/health           → JSON health of all branches (public)
 *   GET      /api/health/:branch   → JSON health of one branch (public)
 *   GET      /api/branches         → branch config, no passwords (public)
 *   GET      /runbooks/:id         → operator-facing runbook page
 *   GET      /health               → simple 200 OK liveness probe
 *   OPTIONS  /*                    → CORS preflight
 *   GET  /api/control-tower   → combined snapshot for hospitals, external services, and action queue
 *   GET  /api/runbooks        → runbook index for the action queue
 *   GET  /api/runbooks/:id    → runbook JSON detail
 *   GET  /api/health          → JSON health of all branches
 *   GET  /api/health/:branch  → JSON health of one branch
 *   POST /api/scan/:branch    → scan guidance for the selected branch
 *   GET  /api/branches        → branch config (no passwords)
 *   GET  /runbooks/:id        → operator-facing runbook page
 *   GET  /health              → simple 200 OK liveness probe
 */

// ── MOH external portals (simple HTTP probe, no login required) ──────────────
const MOH_PORTALS = [
  {
    id:       "moh-claims",
    name:     "بوابة المطالبات",
    nameEn:   "MOH Claims Portal",
    desc:     "E-Claims System",
    url:      "https://moh-claims.brainsait.org/",
    provider: "GlobeMed Saudi Arabia",
  },
  {
    id:       "moh-approval",
    name:     "بوابة الموافقات",
    nameEn:   "MOH Approval Portal",
    desc:     "Purchasing Program System",
    url:      "https://moh-approval.brainsait.org/",
    provider: "Ministry of Health",
  },
  {
    id:       "nphies",
    name:     "بوابة نفيس",
    nameEn:   "NPHIES Portal",
    desc:     "National Platform for Health Insurance Exchange & Services",
    url:      "https://nphies.sa/",
    provider: "NPHIES",
  },
];

const INFRASTRUCTURE_REFERENCE = {
  company: "BrainSAIT LTD",
  operations: "Saudi Arabia (Riyadh)",
  cloudflareAccountId: "d7b99530559ab4f2545e9bdc72a7ab9b",
  oid: "1.3.6.1.4.1.61026",
  primaryDomain: "brainsait.org",
  referenceDomains: ["brainsait.io", "brainsait.de", "elfadil.com"],
  activeWorkers: 67,
  d1Databases: 13,
  kvNamespaces: 20,
  edgeModel: "Single public edge entry with modular healthcare, billing, AI, and ERP services behind Cloudflare and private network links.",
  networkStack: [
    "Cloudflare Workers and Pages at the public edge",
    "Cloudflare Tunnels for private service ingress",
    "Tailscale mesh networking for node-to-node connectivity",
    "D1, KV, and R2 for edge-native state, caching, and storage",
  ],
};

const EDGE_SERVICE_DIRECTORY = [
  {
    path: "/patient",
    aliases: ["/bsma"],
    slug: "bsma",
    tone: "teal",
    shortName: "BSMA",
    title: "BSMA Patient Interface",
    host: "app.brainsait.org",
    category: "Patient interface",
    audience: "Patients, families, and guided front-desk journeys",
    kind: "primary",
    description: "BSMA is the patient front door for appointments, medical records, claims follow-up, and Arabic-first care communication across BrainSAIT.",
    launchHref: "https://app.brainsait.org",
    launchLabel: "Open BSMA",
    features: [
      "Patient-facing appointments, records, and claims access",
      "Arabic-first experience with guided digital journeys",
      "Connected to provider, payer, and government workflows",
    ],
  },
  {
    path: "/givc",
    slug: "givc",
    tone: "gold",
    shortName: "GIVC",
    title: "GIVC Provider Interface",
    host: "givc.brainsait.org",
    category: "Provider interface",
    audience: "Clinicians, nursing teams, and care coordinators",
    kind: "primary",
    description: "Provider-facing access to patient records, encounters, scheduling, and AI-assisted clinical operations.",
    launchHref: "https://givc.brainsait.org",
    launchLabel: "Open GIVC",
    features: [
      "Clinician and care-team operational workflows",
      "Care coordination with voice and AI support",
      "Connected to BSMA patient context and Oracle operations",
    ],
  },
  {
    path: "/sbs",
    slug: "sbs",
    tone: "blue",
    shortName: "SBS",
    title: "SBS Payer Interface",
    host: "sbs.brainsait.org",
    category: "Payer interface",
    audience: "RCM teams, coders, and billing operators",
    kind: "primary",
    description: "Payer-facing revenue cycle workflows for eligibility, coding quality, rejections, claim readiness, and reimbursement follow-up.",
    launchHref: "https://sbs.brainsait.org",
    launchLabel: "Open SBS",
    features: [
      "NPHIES-aware revenue workflows",
      "Claims scanner and rejection intelligence",
      "Oracle Bridge-backed medical and claims reads",
    ],
  },
  {
    path: "/government",
    aliases: ["/nphies", "/etimad"],
    slug: "government",
    tone: "white",
    shortName: "Gov",
    title: "Government Interface",
    host: "nphies.sa",
    category: "Government interface",
    audience: "NPHIES, Etimad, and public-sector submission teams",
    kind: "primary",
    description: "Government submission lane for Saudi exchange, reimbursement coordination, and Etimad-linked approval paths.",
    launchHref: "https://nphies.sa",
    launchLabel: "Open NPHIES",
    relatedLinks: [
      { href: "https://nphies.sa", label: "NPHIES exchange" },
      { href: "https://etimad.sa", label: "Etimad procurement and approvals" },
    ],
    features: [
      "NPHIES-aligned exchange and payer submission readiness",
      "Etimad-linked government coordination paths",
      "Connected to SBS payer operations and Oracle claim flows",
    ],
  },
  {
    path: "/api",
    slug: "api",
    tone: "white",
    shortName: "API",
    title: "Healthcare API Gateway",
    host: "api.brainsait.org",
    category: "Interoperability",
    audience: "Platform engineers, integration teams, and partner systems",
    kind: "support",
    description: "Unified healthcare and workflow APIs for FHIR, patient services, claims orchestration, and AI-driven platform tasks.",
    launchHref: "https://api.brainsait.org",
    launchLabel: "Open API Gateway",
    features: [
      "FHIR and healthcare integration endpoints",
      "Claim, patient, and workflow service surfaces",
      "Shared audit and request-tracing patterns",
    ],
  },
  {
    path: "/mcp",
    slug: "mcp",
    tone: "white",
    shortName: "MCP",
    title: "MCP Agent Gateway",
    host: "mcp.brainsait.org",
    category: "AI orchestration",
    audience: "Internal AI agents, automation surfaces, and platform operators",
    kind: "support",
    description: "Model Context Protocol access for BrainSAIT agents, shared tools, orchestration routes, and controlled automation.",
    launchHref: "https://mcp.brainsait.org",
    launchLabel: "Open MCP Gateway",
    features: [
      "MASTERLINC and domain-specific agent surfaces",
      "Shared operational APIs for internal tooling",
      "Central entrypoint for agent-to-platform access",
    ],
  },
  {
    path: "/oasis",
    slug: "oasis",
    tone: "teal",
    shortName: "Oasis+",
    title: "Oracle Oasis+ Gateway",
    host: "oasis.brainsait.org",
    category: "ERP access",
    audience: "Hospital operations and branch administrators",
    kind: "support",
    description: "Zero-trust access to Oracle Oasis+ ERP across the hospital network with live operational monitoring.",
    launchHref: "https://oasis.brainsait.org",
    launchLabel: "Open Oasis+",
    features: [
      "Branch-aware Oracle and hospital access",
      "Cloudflare Tunnel-protected connectivity",
      "Aligned with Control Tower health monitoring",
    ],
  },
  {
    path: "/oracle",
    slug: "oracle",
    tone: "teal",
    shortName: "Oracle",
    title: "Oracle Bridge and Claim Scanner",
    host: "oracle.brainsait.org",
    category: "Claims intelligence",
    audience: "Claims teams and Oracle-integrated automation",
    kind: "support",
    description: "Oracle Bridge sessions, claim scanning, medical records retrieval, and operational integration for hospital billing flows.",
    launchHref: "https://oracle.brainsait.org",
    launchLabel: "Open Oracle Gateway",
    features: [
      "Server-side Oracle session handling",
      "Scanner telemetry into the Control Tower",
      "Bridged labs, radiology, documents, and claims data",
    ],
  },
  {
    path: "/simulation",
    slug: "simulation",
    tone: "gold",
    shortName: "Sim",
    title: "Simulated Hospital",
    host: "simulation.brainsait.org",
    category: "Agentic simulation",
    audience: "LINC agents, platform engineers, and training operators",
    kind: "support",
    description: "Digital twin hospital environment used to train and validate LINC agents across virtual care, insurance, pharmacy, and radiology flows.",
    launchHref: "https://simulation.brainsait.org",
    launchLabel: "Open simulation",
    features: [
      "Virtual patients and clinician workflows",
      "Virtual insurance, pharmacy, and radiology modules",
      "Safe validation environment for MCP-connected agents",
    ],
  },
  {
    path: "/status",
    slug: "status",
    tone: "white",
    shortName: "Status",
    title: "Public Status and Operations",
    host: "status.brainsait.org",
    category: "Public observability",
    audience: "Leadership, partners, and operations teams",
    kind: "support",
    description: "Public-facing operational summary for hospitals, external services, claim readiness, and platform actions.",
    features: [
      "Live snapshot powered by the control-tower model",
      "Safe public operations view without internal controls",
      "Linked to infrastructure metadata and service directory",
    ],
  },
  {
    path: "/docs",
    slug: "docs",
    tone: "white",
    shortName: "Docs",
    title: "Documentation Gateway",
    host: "docs.brainsait.org",
    category: "Knowledge access",
    audience: "Implementation teams, partners, and operators",
    kind: "support",
    description: "Documentation and reference access for platform routes, operational procedures, and integration guidance.",
    features: [
      "Reference routing and architecture surfaces",
      "Operational documentation entrypoint",
      "Linked from the main edge domain",
    ],
  },
  {
    path: "/admin",
    slug: "admin",
    tone: "white",
    shortName: "Admin",
    title: "Admin and Control Surface",
    host: "admin.brainsait.org",
    category: "Privileged operations",
    audience: "Platform administrators and incident responders",
    kind: "support",
    description: "Privileged operator entrypoint for admin workflows, escalations, and controlled access into platform management surfaces.",
    features: [
      "Control-tower-aligned administrative routing",
      "Zero-trust operator posture",
      "Runbook and incident workflow adjacency",
    ],
  },
  {
    path: "/ai",
    aliases: ["/maos", "/agents"],
    slug: "maos",
    tone: "gold",
    shortName: "Agent OS",
    title: "MAOS — Agent Operating System",
    host: "ai.brainsait.org",
    category: "AI orchestration",
    audience: "AI agents, platform operators, and automation engineers",
    kind: "support",
    description: "Multi-Agent Operating System orchestrating healthcare AI agents, task execution, shared memory, and team-based workflows across the BrainSAIT platform.",
    launchHref: "https://ai.brainsait.org",
    launchLabel: "Open MAOS",
    features: [
      "Dynamic agent registry with YAML-defined roles",
      "Pipeline task execution with shared memory",
      "Team assembly for clinical, claims, and research workflows",
    ],
  },
  {
    path: "/desktops",
    slug: "desktops",
    tone: "teal",
    shortName: "Desktops",
    title: "Agent Desktops (Cua)",
    host: "desktops.brainsait.org",
    category: "Agent virtualization",
    audience: "AI agents and platform engineers",
    kind: "support",
    description: "Virtual desktop environments for AI agents — isolated workstations with coding, research, and clinical tools accessible via VNC.",
    launchHref: "https://desktops.brainsait.org",
    launchLabel: "Open Desktops",
    features: [
      "Coding, research, clinical, and training desktop templates",
      "VNC-accessible agent workstations",
      "Isolated environments with persistent storage",
    ],
  },
  {
    path: "/research",
    slug: "research",
    tone: "blue",
    shortName: "Research Lab",
    title: "Research Automation Lab",
    host: "research.brainsait.org",
    category: "Research automation",
    audience: "Researchers, clinical scientists, and data teams",
    kind: "support",
    description: "Multi-agent research pipeline with automated literature review, hypothesis generation, critical evaluation, experiment design, and peer review.",
    launchHref: "https://research.brainsait.org",
    launchLabel: "Open Research Lab",
    features: [
      "5-agent research pipeline from question to experiment design",
      "PubMed, ClinicalTrials.gov, and Cochrane integration",
      "Saudi Vision 2030 healthcare research alignment",
    ],
  },
  {
    path: "/automation",
    slug: "automation",
    tone: "white",
    shortName: "Automation",
    title: "Automation Workflows",
    host: "automation.brainsait.org",
    category: "Workflow automation",
    audience: "Platform operators and automation engineers",
    kind: "support",
    description: "n8n-powered automation workflows for document analysis, research pipelines, training generation, and operational tasks.",
    launchHref: "https://automation.brainsait.org",
    launchLabel: "Open Automation",
    features: [
      "Document analysis and vector storage pipelines",
      "Research automation with agent integration",
      "Training module generation from clinical guidelines",
    ],
  },
  {
    path: "/telegram",
    slug: "telegram",
    tone: "teal",
    shortName: "Telegram",
    title: "Telegram Control Interface",
    host: "telegram.brainsait.org",
    category: "Universal control",
    audience: "All platform users and operators",
    kind: "support",
    description: "Telegram Super-Bot providing universal control interface for AI queries, server management, research, simulation, and platform operations.",
    launchHref: "https://t.me/BrainSAITBot",
    launchLabel: "Open Telegram Bot",
    features: [
      "Command-driven access to all MAOS agent teams",
      "Server management and deployment controls",
      "Research and simulation triggers from chat",
    ],
  },
];

const EDGE_SERVICE_ROUTE_MAP = new Map(
  EDGE_SERVICE_DIRECTORY.flatMap((service) =>
    [service.path, ...(service.aliases || [])].map((path) => [path, service]),
  ),
);

const PLATFORM_VERSION = "5.0.0";

const COMPLIANCE_PROFILE = Object.freeze({
  hipaa: true,
  pdpl: true,
  nphies: true,
  fhir_r4: true,
});

const MCP_AGENT_NETWORK = Object.freeze([
  "MASTERLINC",
  "ClaimLinc",
  "PolicyLinc",
  "ClinicalLinc",
  "TTLINC",
  "RadioLinc",
  "ComplianceLinc",
  "Basma",
  "CodeLinc",
  "AuthLinc",
  "BridgeLinc",
  "DRGLinc",
  "HEALTHCARELINC",
]);

const MAOS_SYSTEM_INFO = Object.freeze({
  version: "1.0.0",
  platform: "BrainSAIT eCarePlus",
  modules: [
    { name: "MAOS Orchestrator", status: "active", description: "Multi-Agent Operating System coordinator" },
    { name: "Agent Registry", status: "active", description: "YAML-defined agent management" },
    { name: "Task Engine", status: "active", description: "Pipeline-style workflow execution" },
    { name: "Memory Layer", status: "active", description: "Shared context across agent teams" },
    { name: "Agent Router", status: "active", description: "Task-to-team routing intelligence" },
  ],
  agentTeams: [
    { name: "Clinical", agents: ["doctor_agent", "nurse_agent", "medical_research_agent"], task: "Clinical assessment and diagnosis" },
    { name: "Claims", agents: ["claims_agent", "compliance_agent"], task: "Revenue cycle and claims processing" },
    { name: "Infrastructure", agents: ["devops_agent"], task: "Server management and deployment" },
    { name: "Research", agents: ["medical_research_agent", "knowledge_agent"], task: "Literature review and hypothesis generation" },
    { name: "Knowledge", agents: ["knowledge_agent"], task: "Vector-based document retrieval" },
  ],
  scenarios: [
    { name: "Hospital Simulation", endpoint: "/api/simulate", agents: 6, scenarios: ["cardiac-chest-pain", "respiratory-infection", "diabetic-emergency", "oncology-followup"] },
    { name: "Research Lab", endpoint: "/api/research", agents: 5 },
  ],
  desktopTemplates: ["coding", "research", "clinical", "training"],
});

const PORTAL_STACK_LAYERS = Object.freeze([
  {
    label: "Edge",
    title: "Cloudflare Edge Gateway",
    detail: "The public portal router, control-tower views, and health surfaces are served from Cloudflare Workers at the platform edge.",
    outcome: "Global entry routing with zero-trust delivery.",
  },
  {
    label: "BOS",
    title: "BrainSAIT Operating System",
    detail: "BOS coordinates orchestration, control-tower state, routing intent, and safe operational policy across BrainSAIT surfaces.",
    outcome: "One orchestration plane for healthcare workflows.",
  },
  {
    label: "MCP",
    title: "MCP Agent Network",
    detail: "MASTERLINC and domain agents connect through the MCP gateway for controlled tool access, context exchange, and monitored automation.",
    outcome: "Shared agent intelligence without breaking governance boundaries.",
  },
  {
    label: "BOT",
    title: "BrainSAIT Operational Tools",
    detail: "BOT automates claims follow-up, runbook execution, operational triage, and service-to-service coordination for live healthcare estates.",
    outcome: "Operational actions move from manual to repeatable automation.",
  },
  {
    label: "Oracle",
    title: "Oracle Hospital Gateway",
    detail: "Oracle Oasis and branch portals stay connected through the existing Cloudflare tunnel and branch probing model already used by the worker.",
    outcome: "Hospital access remains stable and branch-aware.",
  },
  {
    label: "Sim",
    title: "Agentic Simulated Hospital",
    detail: "A digital twin environment validates LINC agents against virtual patients, doctors, insurance, pharmacy, and radiology flows before live rollout.",
    outcome: "Safe rehearsal for agentic healthcare automation.",
  },
]);

const CONTROL_TOWER_LAYERS = [
  {
    label: "Layer 1",
    title: "Hospital Systems",
    detail: "Oracle ERP, HIS, LIS, RIS, and branch workflows remain the operational source of truth.",
    outcome: "Capture data where care and billing actually happen.",
  },
  {
    label: "Layer 2",
    title: "Integration Gateway",
    detail: "FHIR APIs, adapters, and secure hospital connectors normalize legacy systems into modern services.",
    outcome: "Create one dependable interface across hospitals.",
  },
  {
    label: "Layer 3",
    title: "BrainSAIT Intelligence",
    detail: "AI agents monitor claims, infrastructure, compliance, and clinical signals in one coordinated fabric.",
    outcome: "Move from visibility to guided action.",
  },
  {
    label: "Layer 4",
    title: "Control Tower Dashboard",
    detail: "Leadership-grade monitoring, alerting, and operational automation live across brainsait.org and the Control Tower.",
    outcome: "Operate the healthcare network as a single system.",
  },
];

const CLAIMS_WORKFLOW = [
  {
    title: "Hospital ERP",
    detail: "Claims, coding, and encounter events originate inside each branch.",
  },
  {
    title: "BrainSAIT Adapter",
    detail: "FHIR and data adapters transform Oracle and hospital payloads into clean APIs.",
  },
  {
    title: "NPHIES Service",
    detail: "Eligibility, submission, tracking, and reconciliation are executed through one claims gateway.",
  },
  {
    title: "Insurance Payer",
    detail: "External insurers process approvals, rejections, and payment decisions.",
  },
  {
    title: "Payment Return",
    detail: "Financial outcomes flow back to the dashboard for action and reporting.",
  },
];

const AGENT_BLUEPRINT = [
  {
    title: "Clinical Agent",
    mission: "Summarize records and flag abnormal patterns across encounters and labs.",
  },
  {
    title: "Claims Agent",
    mission: "Watch NPHIES throughput, detect coding errors, and surface delayed claims before they age.",
  },
  {
    title: "Infrastructure Agent",
    mission: "Monitor tunnel health, latency, and service availability across every hospital.",
  },
  {
    title: "Compliance Agent",
    mission: "Enforce FHIR, NPHIES, and Saudi healthcare policy alignment before issues spread.",
  },
];

const AUTOMATION_PLAYBOOKS = [
  {
    title: "Rejected Claim Recovery",
    detail: "When a payer rejects a claim, notify the hospital team, attach the reason, and queue remediation.",
  },
  {
    title: "Eligibility Pre-check",
    detail: "Run validation before submission so low-quality claims never enter the main flow.",
  },
  {
    title: "Latency Escalation",
    detail: "If a branch slows down or drops, trigger an infrastructure incident path through n8n.",
  },
  {
    title: "Daily Executive Digest",
    detail: "Publish hospital performance, claim movement, and tunnel health into one morning report.",
  },
];

const DEPLOYMENT_STEPS = [
  "Clone or update the oracle-setup repository on the deployment runner.",
  "Render secrets into the runtime environment without committing plaintext values.",
  "Launch the Oracle developer stack or production stack with the approved compose file.",
  "Run health checks and publish the resulting status back to the control plane.",
];

const SECURITY_GUARDRAILS = [
  {
    title: "Zero Trust Access",
    detail: "Cloudflare Zero Trust, SSO, and device verification for every privileged workflow.",
  },
  {
    title: "API Protection",
    detail: "JWT authentication, API keys, rate limiting, and explicit service-to-service boundaries.",
  },
  {
    title: "Private Network Design",
    detail: "mTLS, internal Docker networks, and no direct exposure of private hospital infrastructure.",
  },
];

const DATA_PRODUCTS = [
  {
    title: "Claims Analytics",
    detail: "Approval rates, rejection trends, and insurance delay patterns by hospital and payer.",
  },
  {
    title: "Operational Telemetry",
    detail: "API logs, uptime, tunnel stability, and latency history for the full estate.",
  },
  {
    title: "Patient Statistics",
    detail: "Anonymized healthcare indicators prepared for network-wide benchmarking and intelligence.",
  },
  {
    title: "Hospital Scorecards",
    detail: "Branch-level performance snapshots for leadership, finance, and operations teams.",
  },
];

const PLATFORM_APP_BLUEPRINT = [
  {
    id: "oracle-claim-scanner",
    name: "Oracle Claim Scanner",
    category: "Operations",
    sourceType: "live-service",
    description: "Cloudflare worker that scans Oracle claim bundles, persists watchlist state, and feeds telemetry into the control tower.",
    automationFocus: "Batch scans, watchlist refresh, and scanner session reuse across hospitals.",
    href: "/api/control-tower",
    hrefLabel: "Open live claims feed",
  },
  {
    id: "fhir-integration-bridge",
    name: "FHIR Integration Bridge",
    category: "Interoperability",
    sourceType: "embedded-pipeline",
    description: "Node-to-Python bridge that validates FHIR payloads and enriches SBS coding before submission.",
    automationFocus: "Pre-submit validation, SBS enrichment, and NPHIES-ready bundle construction.",
    href: null,
    hrefLabel: "Embedded in pipeline",
  },
  {
    id: "sbs-validator",
    name: "SBS Coding Validator",
    category: "Coding Quality",
    sourceType: "embedded-pipeline",
    description: "Enhanced SBS and FHIR validation stack for code hygiene, prior-auth flags, and NPHIES rule enforcement.",
    automationFocus: "Detect contract-mapping issues before they become claim blockers.",
    href: null,
    hrefLabel: "Embedded in pipeline",
  },
  {
    id: "rajhi-pipeline-factory",
    name: "Batch Pipeline Factory",
    category: "Revenue Recovery",
    sourceType: "derived-workflow",
    description: "Normalizes payer batches, builds attachment matrices, and prepares appeal-ready submission payloads.",
    automationFocus: "Orchestrate batch preparation, prioritization, and artifact generation for each appeal window.",
    href: null,
    hrefLabel: "Pipeline workflow",
  },
  {
    id: "nphies-assisted-submit",
    name: "NPHIES Assisted Submitter",
    category: "Submission",
    sourceType: "hybrid-operator",
    description: "Guided operator workflow that opens NPHIES communication mode, attaches evidence, and captures submission proof.",
    automationFocus: "Human-in-the-loop submission with safety checks, screenshots, and success verification.",
    href: "https://nphies.sa/",
    hrefLabel: "Open NPHIES",
  },
  {
    id: "appeal-letter-generator",
    name: "Appeal Letter Generator",
    category: "Documentation",
    sourceType: "embedded-pipeline",
    description: "Builds bilingual appeal letters aligned to rejection codes, deadlines, and payer communication expectations.",
    automationFocus: "Generate supporting documents for fast claims recovery across high-priority bundles.",
    href: null,
    hrefLabel: "Embedded in pipeline",
  },
];

const CLAIM_REJECTION_CODES = {
  "BE-1-4": { name: "No Prior Authorization", severity: "high" },
  "MN-1-1": { name: "Medical Necessity Not Met", severity: "medium" },
  "CV-1-3": { name: "Coverage or Benefits Limitation", severity: "high" },
  "BE-1-3": { name: "Service Code Not in Contract", severity: "critical" },
  "AD-1-4": { name: "Diagnosis Procedure Mismatch", severity: "medium" },
  "SE-1-6": { name: "Missing Investigation Results", severity: "high" },
  "CV-1-9": { name: "Follow-up Within Restricted Days", severity: "medium" },
  "AD-3-7": { name: "Administrative Coding Error", severity: "high" },
  "AD-2-4": { name: "Incomplete Clinical Documentation", severity: "medium" },
};

const CLAIMS_BASELINE = {
  referenceDate: "2026-03-25",
  batchId: "BAT-2026-NB-00004295-OT",
  payer: "Al Rajhi Takaful",
  provider: "Hayat National Hospital - Riyadh",
  appealDeadline: "2026-04-06",
  totalClaims: 73,
  readyClaims: 63,
  blockedClaims: 10,
  withinWindow: true,
  byPriority: {
    CRITICAL: 3,
    HIGH: 8,
    NORMAL: 52,
    BLOCKER: 10,
  },
  byRejectionCode: {
    "BE-1-4": 43,
    "MN-1-1": 17,
    "CV-1-3": 13,
    "BE-1-3": 10,
    "AD-1-4": 5,
    "CV-1-9": 3,
    "AD-3-7": 2,
    "SE-1-6": 2,
    "AD-2-4": 1,
  },
  totalServiceItems: 189,
  readyServiceItems: 168,
  blockedServiceItems: 21,
  avgItemsPerClaim: 2.589,
  blockerIssue: {
    code: "BLOCKER_RECODE_96092-ERR",
    affectedClaims: 10,
    affectedServiceItems: 21,
    description: "Service code unknown in contract. Claims must be recoded before resubmission.",
  },
  criticalClaims: [
    {
      bundleId: "f5cb6933-d93b-4d98-9cd9-bbfcfceaa8cb",
      patientName: "سوده عبدا ناصر خالد",
      focus: "Chemotherapy prior authorization appeal",
    },
    {
      bundleId: "6e067c99-1029-4dda-8753-8020f7746c5d",
      patientName: "SARA YEHIA ALI TALEB",
      focus: "Biologic therapy prior authorization",
    },
    {
      bundleId: "480e919e-7743-4107-845e-9db81b192b7a",
      patientName: "HAYAT DARWISH A",
      focus: "Cardiology and diabetes medication appeal",
    },
  ],
  blockerClaims: [
    {
      bundleId: "976d0320-625b-4ae0-aede-d7f67859c3dc",
      patientName: "OMAR MAHMOUD DEEB A",
      reason: "96092-ERR recode required",
    },
    {
      bundleId: "9c155a7d-5874-4c3c-817b-61dbd0b318c1",
      patientName: "MALAK SAEED NAJI MUSLEH",
      reason: "96092-ERR recode required",
    },
    {
      bundleId: "478c8637-d1e4-4e9a-852c-754771e5752f",
      patientName: "MOHAMED MOSAD ABDELGAWAD ATIA",
      reason: "96092-ERR recode required",
    },
    {
      bundleId: "df8a2d79-cba6-4f3b-b187-bd6c8f38f939",
      patientName: "AHMED REDA MOHAMED DAKOUS",
      reason: "96092-ERR recode required",
    },
    {
      bundleId: "8d1d7c07-019c-4a5d-a423-6786db95aea9",
      patientName: "REEMA MASRI",
      reason: "96092-ERR recode plus coverage review",
    },
  ],
  latestScanBatch: {
    sourceFile: "scan_results_1774398418316.json",
    totalEligible: 63,
    processed: 0,
    go: 0,
    partial: 0,
    noGo: 0,
    errorCount: 7,
    skippedBlockers: 10,
    completedAt: "2026-03-25T00:26:57.153Z",
    dominantError: "HTTP 404 across chunks 1-7",
  },
};

const RUNBOOKS = {
  "hospital-connectivity": {
    id: "hospital-connectivity",
    title: "Restore hospital portal connectivity",
    owner: "Infrastructure Agent",
    summary: "Bring an unreachable Oracle portal back online by checking the tunnel, WAN path, and backend endpoint.",
    steps: [
      "Validate that the Cloudflare tunnel process is running for the affected branch.",
      "Check whether the hospital WAN path and internal Oracle host are responding.",
      "Confirm the Oracle login path still resolves and has not changed.",
      "Once restored, re-run the branch probe and confirm the portal is reachable from the control tower.",
    ],
    escalation: {
      label: "Escalate to Infrastructure Lead",
      team: "Infrastructure Agent",
      when: "Escalate if the branch remains offline for more than 15 minutes or the Oracle host is unreachable internally.",
    },
  },
  "hospital-latency": {
    id: "hospital-latency",
    title: "Reduce hospital portal latency",
    owner: "Infrastructure Agent",
    summary: "Stabilize a slow but reachable branch before operator throughput or login reliability degrade.",
    steps: [
      "Inspect Cloudflare tunnel throughput and recent reconnect behavior for the branch.",
      "Check Oracle host load, session count, and backend response time.",
      "Validate WAN quality and packet loss from the branch site.",
      "Keep the branch on the watch list until probe latency returns below the control threshold.",
    ],
    escalation: {
      label: "Escalate WAN investigation",
      team: "Infrastructure Agent",
      when: "Escalate if latency remains above the threshold across two refresh cycles or users report portal timeouts.",
    },
  },
  "external-service-availability": {
    id: "external-service-availability",
    title: "Handle external healthcare service outage",
    owner: "Integration Gateway",
    summary: "Protect operators and queues when an external payer or approval service becomes unreachable.",
    steps: [
      "Verify the service is down from the control tower and not only blocked by a single probe method.",
      "Pause any automation path that depends on the unavailable service.",
      "Notify operators to use the fallback manual workflow until the provider recovers.",
      "Resume normal flow only after the external service probe returns stable state.",
    ],
    escalation: {
      label: "Escalate to Integration Gateway",
      team: "Integration Gateway",
      when: "Escalate immediately if the service outage blocks claims approval, payer workflow, or operator access.",
    },
  },
  "external-service-latency": {
    id: "external-service-latency",
    title: "Monitor degraded external service",
    owner: "Integration Gateway",
    summary: "Keep a slow external healthcare service from becoming an unplanned outage.",
    steps: [
      "Confirm operator workflows are still completing despite slow responses.",
      "Reduce concurrency or defer non-urgent background jobs if needed.",
      "Watch the service for one refresh window and compare with hospital-side latency.",
      "Escalate to the service owner if latency continues to rise or operators begin timing out.",
    ],
    escalation: {
      label: "Escalate degradation",
      team: "Integration Gateway",
      when: "Escalate if degraded response persists across multiple cycles or starts affecting claims work.",
    },
  },
  "nphies-availability": {
    id: "nphies-availability",
    title: "Stabilize NPHIES availability",
    owner: "Claims Agent",
    summary: "Protect claim submission and reconciliation when the NPHIES portal is unavailable or degraded.",
    steps: [
      "Confirm whether NPHIES is fully unreachable or only slow from the control tower location.",
      "Pause queued submissions and reconciliation jobs to avoid partial or duplicate actions.",
      "Notify claims operators to preserve appeal-ready bundles until the platform stabilizes.",
      "Resume submissions only after NPHIES returns to a stable probe state and manual validation succeeds.",
    ],
    escalation: {
      label: "Escalate NPHIES outage",
      team: "Claims Agent",
      when: "Escalate immediately if NPHIES downtime blocks time-sensitive appeals or payment reconciliation.",
    },
  },
  "claims-recode-96092": {
    id: "claims-recode-96092",
    title: "Clear 96092-ERR blocker claims",
    owner: "Claims Coding",
    summary: "Resolve BE-1-3 service-code blockers so blocked claims can move back into the appeal-ready queue.",
    steps: [
      "Open the original invoice and supporting clinical documentation for the blocked bundle.",
      "Confirm the contracted SBS or NPHIES code against the provider-payer contract schedule.",
      "Correct the service code in Oracle and regenerate the claim or appeal package.",
      "Re-run dry-run validation before re-adding the claim to the ready-for-submission queue.",
    ],
    escalation: {
      label: "Escalate to Claims Coding Lead",
      team: "Claims Coding",
      when: "Escalate if the correct contracted code cannot be identified within two hours or contract mapping is disputed.",
    },
  },
  "claims-deadline-submission": {
    id: "claims-deadline-submission",
    title: "Move ready claims before appeal deadline",
    owner: "Revenue Recovery",
    summary: "Use the remaining appeal window to move ready claims into NPHIES or Etimad submission flow before value is lost.",
    steps: [
      "Sort ready claims by CRITICAL, HIGH, then NORMAL priority.",
      "Validate attachments and appeal letters are complete for each ready claim.",
      "Submit ready bundles through the NPHIES communication path and track confirmations.",
      "Escalate any claims still not submitted as the deadline approaches.",
    ],
    escalation: {
      label: "Escalate deadline risk",
      team: "Revenue Recovery",
      when: "Escalate if any CRITICAL or HIGH claims remain unsubmitted inside the final seven days of the appeal window.",
    },
  },
  "claims-prior-auth": {
    id: "claims-prior-auth",
    title: "Work the prior authorization appeal queue",
    owner: "Claims Agent",
    summary: "Prioritize BE-1-4 and chemo or biologic cases that need authorization evidence before resubmission.",
    steps: [
      "Group claims with BE-1-4 and identify chemotherapy, biologic, or specialist medication cases first.",
      "Confirm prior authorization documents, oncology or specialty notes, and treatment plans are attached.",
      "Rebuild the appeal packet and mark the claim ready only after documentation is complete.",
      "Track unresolved prior-auth cases separately so they do not miss the appeal deadline.",
    ],
    escalation: {
      label: "Escalate prior-auth backlog",
      team: "Claims Agent",
      when: "Escalate if critical therapy cases remain unresolved or authorization evidence is missing for more than one day.",
    },
  },
  "scanner-http-404": {
    id: "scanner-http-404",
    title: "Repair Oracle scan batch HTTP 404 failures",
    owner: "Integration Gateway",
    summary: "Resolve scanner batch failures when the Oracle scanner returns HTTP 404 and processes zero eligible claims.",
    steps: [
      "Verify the scanner worker route, deployment, and expected /scan-batch path are live.",
      "Confirm the portal and scanner share the correct base URL and API key configuration.",
      "Run a single-claim scan test before re-running the full batch.",
      "Only reopen the batch workflow after the scanner returns processed claims instead of route errors.",
    ],
    escalation: {
      label: "Escalate scanner failure",
      team: "Integration Gateway",
      when: "Escalate immediately if one full eligible batch returns zero processed claims or repeated HTTP 404 chunk failures.",
    },
  },
};

// ── Branch registry (single source of truth) ───────────────────────────────
const BRANCHES = [
  {
    id:          "riyadh",
    name:        "الرياض",
    nameEn:      "Riyadh Hospital",
    subdomain:   "oracle-riyadh.brainsait.org",
    backend:     "https://128.1.1.185",
    loginPath:   "/prod/faces/Home",
    tls:         true,
    probeTimeout: 8000,
    region:      "Riyadh",
  },
  {
    id:          "madinah",
    name:        "المدينة المنورة",
    nameEn:      "Madinah Hospital",
    subdomain:   "oracle-madinah.brainsait.org",
    backend:     "http://172.25.11.26",
    loginPath:   "/Oasis/faces/Login.jsf",   // FIX-1+3: was wrong path + wrong status
    tls:         false,
    probeTimeout: 8000,
    region:      "Madinah",
  },
  {
    id:          "unaizah",
    name:        "عنيزة",
    nameEn:      "Unaizah Hospital",
    subdomain:   "oracle-unaizah.brainsait.org",
    backend:     "http://10.0.100.105",
    loginPath:   "/prod/faces/Login.jsf",
    tls:         false,
    probeTimeout: 8000,
    region:      "Qassim",
  },
  {
    id:          "khamis",
    name:        "خميس مشيط",
    nameEn:      "Khamis Mushait Hospital",
    subdomain:   "oracle-khamis.brainsait.org",  // FIX-2: dedicated subdomain
    backend:     "http://172.30.0.77",
    loginPath:   "/prod/faces/Login.jsf",
    tls:         false,
    probeTimeout: 8000,
    region:      "Asir",
  },
  {
    id:          "jizan",
    name:        "جازان",
    nameEn:      "Jizan Hospital",
    subdomain:   "oracle-jizan.brainsait.org",
    backend:     "http://172.17.4.84",
    loginPath:   "/prod/faces/Login.jsf",
    tls:         false,
    probeTimeout: 12000,  // FIX-5: Jizan is slow — 12s probe timeout
    region:      "Jizan",
  },
  {
    id:          "abha",
    name:        "أبها",
    nameEn:      "Abha Hospital",
    subdomain:   "oracle-abha.brainsait.org",
    backend:     "http://172.19.1.1",
    loginPath:   "/Oasis/faces/Home",   // FIX-3: Abha uses /Oasis/faces/Home
    tls:         false,
    probeTimeout: 8000,
    region:      "Asir",
  },
];

const AUTO_REFRESH_INTERVAL_MS = 60_000;
const BRANCH_WATCH_THRESHOLD_MS = 5_000;
const EXTERNAL_WATCH_THRESHOLD_MS = 3_500;
const ACTION_SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, info: 3 };

// ── Health probes ────────────────────────────────────────────────────────────
async function probeUrl(url, timeoutMs, userAgent) {
  const start = Date.now();

  const runRequest = async (method) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        method,
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": userAgent },
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let res = await runRequest("HEAD");
    if (res.status === 405 || res.status === 501) {
      res = await runRequest("GET");
    }

    return {
      online: res.status < 500,
      status: res.status,
      latency: Date.now() - start,
      url,
      probed: new Date().toISOString(),
    };
  } catch (error) {
    return {
      online: false,
      status: 0,
      latency: Date.now() - start,
      url,
      error: error.name === "AbortError" ? "timeout" : error.message,
      probed: new Date().toISOString(),
    };
  }
}

async function probeBranch(branch) {
  const url = `https://${branch.subdomain}${branch.loginPath}`;
  return {
    id: branch.id,
    ...(await probeUrl(url, branch.probeTimeout, "BrainSAIT-HealthProbe/3.2")),
  };
}

async function probeExternalPortal(portal) {
  return {
    id: portal.id,
    ...(await probeUrl(portal.url, portal.probeTimeout || 9_000, "BrainSAIT-ExternalProbe/3.2")),
  };
}

async function probeAllBranches() {
  const results = await Promise.all(BRANCHES.map(probeBranch));
  return Object.fromEntries(results.map(result => [result.id, result]));
}

async function probeAllExternalPortals() {
  const results = await Promise.all(MOH_PORTALS.map(probeExternalPortal));
  return Object.fromEntries(results.map(result => [result.id, result]));
}

function evaluateProbe(probe, watchThresholdMs, options = {}) {
  if (!probe?.online) {
    return {
      tone: "critical",
      label: probe?.error === "timeout" ? "Timed Out" : (options.offlineLabel || "Offline"),
      signal: probe?.error === "timeout"
        ? (options.timeoutSignal || "Probe exceeded the response threshold.")
        : (options.offlineSignal || "Connectivity investigation required."),
    };
  }

  if ((probe.latency || 0) > watchThresholdMs) {
    return {
      tone: "watch",
      label: options.watchLabel || "Degraded",
      signal: options.watchSignal || "The service is reachable but slower than the target operating threshold.",
    };
  }

  return {
    tone: "stable",
    label: options.stableLabel || "Operational",
    signal: options.stableSignal || "The service is healthy for operators.",
  };
}

function summarizeServices(items) {
  const onlineItems = items.filter(item => item.online);
  return {
    total: items.length,
    online: onlineItems.length,
    offline: items.filter(item => !item.online).length,
    degraded: items.filter(item => item.tone === "watch").length,
    critical: items.filter(item => item.tone === "critical").length,
    availabilityPct: items.length ? Math.round((onlineItems.length / items.length) * 100) : 0,
    avgLatencyMs: onlineItems.length
      ? Math.round(onlineItems.reduce((sum, item) => sum + (item.latency || 0), 0) / onlineItems.length)
      : null,
  };
}

function enrichHospital(branch, probe) {
  const evaluation = evaluateProbe(probe, BRANCH_WATCH_THRESHOLD_MS, {
    stableLabel: "Operational",
    watchLabel: "High Latency",
    stableSignal: "Stable for operator access.",
    watchSignal: "Live but slower than expected for daily operations.",
    offlineSignal: "Operators cannot reach the Oracle portal.",
    timeoutSignal: "The tunnel responded too slowly for the branch threshold.",
  });

  return {
    id: branch.id,
    kind: "hospital",
    name: branch.name,
    nameEn: branch.nameEn,
    region: branch.region,
    subdomain: branch.subdomain,
    backend: branch.backend,
    backendHost: branch.backend.replace(/^https?:\/\//, ""),
    loginPath: branch.loginPath,
    url: `https://${branch.subdomain}${branch.loginPath}`,
    online: !!probe?.online,
    statusCode: probe?.status || 0,
    latency: probe?.latency ?? null,
    error: probe?.error || null,
    probedAt: probe?.probed || null,
    tone: evaluation.tone,
    healthLabel: evaluation.label,
    signal: evaluation.signal,
  };
}

function redactHospitalInternals(hospital) {
  const safe = { ...hospital };
  delete safe.backend;
  delete safe.backendHost;
  return safe;
}

function redactActionInternals(action) {
  const scrubbedRecommendation = String(action.recommendation || "")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "[internal-origin]");
  return {
    ...action,
    recommendation: scrubbedRecommendation,
  };
}

function enrichExternalService(portal, probe) {
  const evaluation = evaluateProbe(probe, EXTERNAL_WATCH_THRESHOLD_MS, {
    stableLabel: "Reachable",
    watchLabel: "Degraded",
    stableSignal: "External service is reachable for operators.",
    watchSignal: "External service is reachable but slower than expected.",
    offlineSignal: "External service is unavailable from the control tower.",
    timeoutSignal: "External service exceeded the monitoring threshold.",
  });

  return {
    id: portal.id,
    kind: "external",
    name: portal.name,
    nameEn: portal.nameEn,
    provider: portal.provider,
    description: portal.desc,
    url: portal.url,
    online: !!probe?.online,
    statusCode: probe?.status || 0,
    latency: probe?.latency ?? null,
    error: probe?.error || null,
    probedAt: probe?.probed || null,
    tone: evaluation.tone,
    healthLabel: evaluation.label,
    signal: evaluation.signal,
  };
}

function normalizeUrl(baseUrl, path = "") {
  return `${String(baseUrl || "").replace(/\/+$/, "")}${path}`;
}

function computeDaysRemaining(appealDeadline) {
  if (!appealDeadline) return null;
  const deadline = new Date(appealDeadline);
  const now = new Date();
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / millisecondsPerDay));
}

function buildTopReasons(byRejectionCode) {
  return Object.entries(byRejectionCode || {})
    .map(([code, count]) => ({
      code,
      count,
      name: CLAIM_REJECTION_CODES[code]?.name || code,
      severity: CLAIM_REJECTION_CODES[code]?.severity || "medium",
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);
}

function buildClaimsWatchlistIds() {
  return Array.from(new Set([
    ...CLAIMS_BASELINE.criticalClaims.map((claim) => claim.bundleId),
    ...CLAIMS_BASELINE.blockerClaims.map((claim) => claim.bundleId),
  ]));
}

function mergeLiveClaimState(referenceClaims, watchlistEntries) {
  const watchlistMap = new Map((watchlistEntries || []).map((entry) => [entry.bundleId, entry]));
  return referenceClaims.map((claim) => {
    const liveEntry = watchlistMap.get(claim.bundleId);
    return {
      ...claim,
      liveStatus: liveEntry?.gateStatus || "UNSEEN",
      liveStatusLabel: liveEntry?.available ? (liveEntry.gateStatus || "UNSEEN") : "Awaiting live scan",
      liveScannedAt: liveEntry?.scannedAt || null,
      liveOutcome: liveEntry?.transactionOutcome || null,
      liveReason: Array.isArray(liveEntry?.gateReason) ? liveEntry.gateReason.join(" | ") : null,
      liveAvailable: !!liveEntry?.available,
    };
  });
}

function buildServiceSignal(service) {
  return service
    ? {
        online: !!service.online,
        tone: service.tone,
        label: service.healthLabel,
        latency: service.latency,
      }
    : {
        online: false,
        tone: "critical",
        label: "Unavailable",
        latency: null,
      };
}

async function fetchScannerClaimsFeed(env) {
  if (!env?.SCANNER_SERVICE && !env?.SCANNER_URL) {
    return {
      available: false,
      source: null,
      error: "scanner_url_not_configured",
    };
  }

  const watchQuery = buildClaimsWatchlistIds().join(",");
  const scannerUrl = new URL(normalizeUrl(env.SCANNER_URL || "https://oracle-scanner.brainsait.org", "/control-tower/claims"));
  scannerUrl.searchParams.set("watch", watchQuery);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = env.SCANNER_SERVICE
      ? await env.SCANNER_SERVICE.fetch(`https://scanner.internal/control-tower/claims?watch=${encodeURIComponent(watchQuery)}`, {
          method: "GET",
          headers: { Accept: "application/json" },
        })
      : await fetch(scannerUrl.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    return {
      available: true,
      source: env.SCANNER_SERVICE ? "service-binding:oracle-claim-scanner" : scannerUrl.toString(),
      statusCode: response.status,
      metrics: payload.metrics || null,
      latestBatch: payload.latestBatch || null,
      scannerStatus: payload.scannerStatus || null,
      watchlist: payload.watchlist || [],
    };
  } catch (error) {
    if (env.SCANNER_SERVICE && env.SCANNER_URL) {
      try {
        const fallbackResponse = await fetch(scannerUrl.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

        if (!fallbackResponse.ok) {
          return {
            available: false,
            source: scannerUrl.toString(),
            statusCode: fallbackResponse.status,
            error: `HTTP ${fallbackResponse.status}`,
          };
        }

        const payload = await fallbackResponse.json();
        return {
          available: true,
          source: scannerUrl.toString(),
          statusCode: fallbackResponse.status,
          metrics: payload.metrics || null,
          latestBatch: payload.latestBatch || null,
          scannerStatus: payload.scannerStatus || null,
          watchlist: payload.watchlist || [],
        };
      } catch (fallbackError) {
        return {
          available: false,
          source: scannerUrl.toString(),
          error: fallbackError.name === "AbortError" ? "timeout" : fallbackError.message,
        };
      }
    }

    return {
      available: false,
      source: env.SCANNER_SERVICE ? "service-binding:oracle-claim-scanner" : scannerUrl.toString(),
      error: error.name === "AbortError" ? "timeout" : error.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildClaimsSnapshot(scannerFeed, externalHealth) {
  const livePortfolio = scannerFeed?.latestBatch?.portfolio || null;
  const batchId = livePortfolio?.batchId || scannerFeed?.latestBatch?.sourceBatchId || CLAIMS_BASELINE.batchId;
  const appealDeadline = livePortfolio?.appealDeadline || CLAIMS_BASELINE.appealDeadline;
  const byPriority = livePortfolio?.byPriority || CLAIMS_BASELINE.byPriority;
  const byRejectionCode = livePortfolio?.byRejectionCode || CLAIMS_BASELINE.byRejectionCode;
  const totalClaims = livePortfolio?.totalClaims ?? CLAIMS_BASELINE.totalClaims;
  const readyClaims = livePortfolio?.readyClaims ?? CLAIMS_BASELINE.readyClaims;
  const blockedClaims = livePortfolio?.blockedClaims ?? CLAIMS_BASELINE.blockedClaims;
  const totalServiceItems = livePortfolio?.totalServiceItems ?? CLAIMS_BASELINE.totalServiceItems;
  const readyServiceItems = livePortfolio?.readyServiceItems ?? CLAIMS_BASELINE.readyServiceItems;
  const blockedServiceItems = livePortfolio?.blockedServiceItems ?? CLAIMS_BASELINE.blockedServiceItems;
  const criticalClaims = mergeLiveClaimState(
    livePortfolio?.criticalClaims?.length ? livePortfolio.criticalClaims : CLAIMS_BASELINE.criticalClaims,
    scannerFeed?.watchlist
  );
  const blockerClaims = mergeLiveClaimState(
    livePortfolio?.blockerClaims?.length ? livePortfolio.blockerClaims : CLAIMS_BASELINE.blockerClaims,
    scannerFeed?.watchlist
  );
  const daysRemaining = computeDaysRemaining(appealDeadline);
  const nphiesSignal = buildServiceSignal(externalHealth?.nphies);
  const approvalSignal = buildServiceSignal(externalHealth?.["moh-approval"]);
  const claimsPortalSignal = buildServiceSignal(externalHealth?.["moh-claims"]);
  const latestBatch = scannerFeed?.latestBatch
    ? {
        sourceBatchId: scannerFeed.latestBatch.sourceBatchId || batchId,
        totalEligible: scannerFeed.latestBatch.totalEligible || readyClaims,
        processed: scannerFeed.latestBatch.processed || 0,
        go: scannerFeed.latestBatch.go || 0,
        partial: scannerFeed.latestBatch.partial || 0,
        noGo: scannerFeed.latestBatch.noGo || 0,
        errorCount: scannerFeed.latestBatch.errorCount || 0,
        completedAt: scannerFeed.latestBatch.completedAt || null,
        dominantError: scannerFeed.latestBatch.dominantError || "No batch errors recorded",
      }
    : CLAIMS_BASELINE.latestScanBatch;
  const sourceMode = livePortfolio
    ? "live-batch"
    : (scannerFeed?.available ? "watchlist-live" : "fallback-reference");
  const liveWatchHits = (scannerFeed?.watchlist || []).filter((entry) => entry.available).length;
  const sourceSummary = sourceMode === "live-batch"
    ? `Live scanner batch ${batchId} from ${scannerFeed.latestBatch?.completedAt || "latest KV state"}.`
    : sourceMode === "watchlist-live"
      ? `Live scanner watchlist is active for ${liveWatchHits} watched claims; portfolio totals still use the current reference batch.`
      : "Scanner claims feed is unavailable. Showing the current reference batch until the upstream recovers.";

  return {
    batchId,
    payer: livePortfolio?.payer || CLAIMS_BASELINE.payer,
    provider: livePortfolio?.provider || CLAIMS_BASELINE.provider,
    appealDeadline,
    withinWindow: typeof livePortfolio?.withinWindow === "boolean" ? livePortfolio.withinWindow : CLAIMS_BASELINE.withinWindow,
    daysRemaining,
    sourceMode,
    sourceSummary,
    summary: {
      totalClaims,
      readyClaims,
      blockedClaims,
      readyPct: totalClaims ? Math.round((readyClaims / totalClaims) * 100) : 0,
      blockedPct: totalClaims ? Math.round((blockedClaims / totalClaims) * 100) : 0,
    },
    approvals: {
      priorAuthClaims: byRejectionCode["BE-1-4"] || 0,
      criticalTherapyClaims: byPriority.CRITICAL || 0,
      coverageReviewClaims: byRejectionCode["CV-1-3"] || 0,
      medicalNecessityClaims: byRejectionCode["MN-1-1"] || 0,
    },
    rejections: {
      topReasons: buildTopReasons(byRejectionCode),
      blockerIssue: livePortfolio?.blockerIssue || CLAIMS_BASELINE.blockerIssue,
      blockerClaims,
    },
    payments: {
      disputedServiceItems: totalServiceItems,
      recoverableServiceItems: readyServiceItems,
      blockedServiceItems,
      recoverablePct: totalServiceItems ? Math.round((readyServiceItems / totalServiceItems) * 100) : 0,
      readyRecoveryClaims: readyClaims,
      blockedRecoveryClaims: blockedClaims,
      amountMetricsAvailable: false,
      note: sourceMode === "live-batch"
        ? "Live payment recovery volume is derived from the latest scanner batch payload. SAR amount fields are still not available upstream."
        : "No SAR amount fields exist in the live upstream feed yet, so payment recovery is tracked by claim and service-item volume.",
    },
    scanner: {
      latestBatch,
      liveSystem: scannerFeed?.available
        ? {
            available: true,
            totalScans: scannerFeed.metrics?.totalScans || 0,
            successfulScans: scannerFeed.metrics?.successfulScans || 0,
            failedScans: scannerFeed.metrics?.failedScans || 0,
            avgDurationMs: scannerFeed.metrics?.avgDurationMs || 0,
          }
        : {
            available: false,
            totalScans: 0,
            successfulScans: 0,
            failedScans: 0,
            avgDurationMs: 0,
          },
      watchlist: scannerFeed?.watchlist || [],
      hospitalSessions: scannerFeed?.scannerStatus?.hospitals || {},
    },
    upstreams: {
      nphies: nphiesSignal,
      mohApproval: approvalSignal,
      mohClaims: claimsPortalSignal,
    },
    byPriority,
    criticalClaims,
  };
}

function buildRunbookIndex() {
  return Object.values(RUNBOOKS).map((runbook) => ({
    id: runbook.id,
    title: runbook.title,
    owner: runbook.owner,
    summary: runbook.summary,
    href: `/runbooks/${runbook.id}`,
    escalationHref: `/runbooks/${runbook.id}#escalation`,
  }));
}

function attachRunbook(action, runbookId) {
  const runbook = RUNBOOKS[runbookId];
  if (!runbook) return action;

  return {
    ...action,
    runbookId,
    runbookTitle: runbook.title,
    runbookHref: `/runbooks/${runbookId}`,
    runbookSummary: runbook.summary,
    escalationLabel: runbook.escalation.label,
    escalationHref: `/runbooks/${runbookId}#escalation`,
  };
}

function buildPlatformApps(claims) {
  const validationDemand = claims.approvals.priorAuthClaims + claims.approvals.medicalNecessityClaims + claims.approvals.coverageReviewClaims;
  const scannerTone = !claims.scanner.liveSystem?.available || claims.sourceMode === "fallback-reference"
    ? "critical"
    : (claims.sourceMode === "watchlist-live" || (claims.scanner.latestBatch.errorCount || 0) > 0)
      ? "watch"
      : "stable";

  const scannerApp = {
    ...PLATFORM_APP_BLUEPRINT.find((app) => app.id === "oracle-claim-scanner"),
    tone: scannerTone,
    healthLabel: scannerTone === "stable" ? "Batch live" : scannerTone === "watch" ? "Watchlist live" : "Feed degraded",
    signal: scannerTone === "stable"
      ? "Full live-batch telemetry is flowing from the scanner into the control tower."
      : scannerTone === "watch"
        ? "The scanner is live, but the control tower is operating on watchlist telemetry or recent batch errors."
        : "The live scanner feed is unavailable and the portal is falling back to reference claims data.",
    automationLabel: claims.sourceMode === "live-batch" ? "Closed-loop automation" : claims.sourceMode === "watchlist-live" ? "Partial automation" : "Automation blocked",
    metricPrimary: { label: "Total scans", value: String(claims.scanner.liveSystem?.totalScans || 0) },
    metricSecondary: { label: "Avg scan time", value: claims.scanner.liveSystem?.avgDurationMs ? `${claims.scanner.liveSystem.avgDurationMs} ms` : "N/A" },
    sourceDetail: claims.sourceMode,
  };

  const fhirTone = validationDemand > 0 ? "watch" : "stable";
  const fhirApp = {
    ...PLATFORM_APP_BLUEPRINT.find((app) => app.id === "fhir-integration-bridge"),
    tone: fhirTone,
    healthLabel: fhirTone === "stable" ? "Ready" : "Validation demand",
    signal: validationDemand > 0
      ? `${validationDemand} claims currently depend on FHIR and NPHIES pre-submit validation paths before safe submission.`
      : "FHIR validation and coding enrichment are staged and ready for the next batch.",
    automationLabel: "Validation automation ready",
    metricPrimary: { label: "Validation demand", value: String(validationDemand) },
    metricSecondary: { label: "Prior-auth flags", value: String(claims.approvals.priorAuthClaims) },
    sourceDetail: "embedded-node-python-bridge",
  };

  const sbsTone = claims.summary.blockedClaims > 0 ? "critical" : validationDemand > 0 ? "watch" : "stable";
  const sbsApp = {
    ...PLATFORM_APP_BLUEPRINT.find((app) => app.id === "sbs-validator"),
    tone: sbsTone,
    healthLabel: sbsTone === "critical" ? "Correction required" : sbsTone === "watch" ? "Validation active" : "Ready",
    signal: claims.summary.blockedClaims > 0
      ? `${claims.summary.blockedClaims} claims are blocked by ${claims.rejections.blockerIssue.code} and should be corrected through the SBS mapping workflow.`
      : validationDemand > 0
        ? "The SBS validator should be applied to clear prior-auth and coding-sensitive rejection patterns before submission."
        : "No active SBS mapping blockers are pressuring the current appeal batch.",
    automationLabel: claims.summary.blockedClaims > 0 ? "Correction queue open" : "Coding guardrails ready",
    metricPrimary: { label: "Blocked claims", value: String(claims.summary.blockedClaims) },
    metricSecondary: { label: "Blocked items", value: String(claims.payments.blockedServiceItems) },
    sourceDetail: claims.rejections.blockerIssue.code || "no-blocker",
  };

  const orchestratorTone = (claims.scanner.latestBatch.errorCount || 0) > 0 && (claims.scanner.latestBatch.processed || 0) === 0
    ? "critical"
    : ((claims.scanner.latestBatch.errorCount || 0) > 0 || claims.sourceMode !== "live-batch")
      ? "watch"
      : "stable";
  const orchestratorApp = {
    ...PLATFORM_APP_BLUEPRINT.find((app) => app.id === "rajhi-pipeline-factory"),
    tone: orchestratorTone,
    healthLabel: orchestratorTone === "critical" ? "Replay required" : orchestratorTone === "watch" ? "Needs fresh batch" : "Ready",
    signal: orchestratorTone === "critical"
      ? `The latest scanner batch produced ${claims.scanner.latestBatch.errorCount} errors and processed no eligible claims. Replay is required.`
      : orchestratorTone === "watch"
        ? "The batch pipeline is prepared, but a fresh scanner run is still needed to promote full live-batch coverage."
        : "Batch preparation and scanner orchestration are aligned to the current live portfolio.",
    automationLabel: orchestratorTone === "stable" ? "Batch automation ready" : "Replay or refresh needed",
    metricPrimary: { label: "Eligible claims", value: String(claims.scanner.latestBatch.totalEligible || claims.summary.readyClaims) },
    metricSecondary: { label: "Batch errors", value: String(claims.scanner.latestBatch.errorCount || 0) },
    sourceDetail: claims.scanner.latestBatch.sourceBatchId || claims.batchId,
  };

  const nphiesTone = !claims.upstreams.nphies.online
    ? "critical"
    : (claims.upstreams.nphies.tone === "watch" || claims.summary.readyClaims > 0)
      ? "watch"
      : "stable";
  const nphiesApp = {
    ...PLATFORM_APP_BLUEPRINT.find((app) => app.id === "nphies-assisted-submit"),
    tone: nphiesTone,
    healthLabel: !claims.upstreams.nphies.online ? "Upstream blocked" : claims.summary.readyClaims > 0 ? "Submission queue ready" : "Standing by",
    signal: !claims.upstreams.nphies.online
      ? "NPHIES is unavailable, so assisted submission should be paused until upstream stability returns."
      : claims.summary.readyClaims > 0
        ? `${claims.summary.readyClaims} claims are ready for communication-mode submission inside the current appeal window.`
        : "NPHIES is reachable and the assisted submitter is ready for the next operator-driven release.",
    automationLabel: claims.summary.readyClaims > 0 ? "Human-in-loop ready" : "Submission lane standing by",
    metricPrimary: { label: "Ready claims", value: String(claims.summary.readyClaims) },
    metricSecondary: { label: "Days remaining", value: claims.daysRemaining == null ? "N/A" : String(claims.daysRemaining) },
    sourceDetail: claims.upstreams.nphies.label,
  };

  const appealTone = claims.summary.readyClaims > 0 && claims.daysRemaining <= 3
    ? "critical"
    : (claims.summary.readyClaims > 0 || claims.summary.blockedClaims > 0)
      ? "watch"
      : "stable";
  const appealApp = {
    ...PLATFORM_APP_BLUEPRINT.find((app) => app.id === "appeal-letter-generator"),
    tone: appealTone,
    healthLabel: appealTone === "critical" ? "Deadline pressure" : appealTone === "watch" ? "Active" : "Ready",
    signal: claims.summary.readyClaims > 0
      ? `Appeal artifacts should be generated for ${claims.summary.readyClaims} ready claims before the ${claims.daysRemaining}-day window closes.`
      : claims.summary.blockedClaims > 0
        ? "Appeal documents remain useful, but coding blockers should be resolved first for blocked bundles."
        : "Letter generation capacity is available and waiting on the next recovery batch.",
    automationLabel: claims.summary.readyClaims > 0 ? "Document generation active" : "Templates ready",
    metricPrimary: { label: "Ready appeals", value: String(claims.summary.readyClaims) },
    metricSecondary: { label: "Critical bundles", value: String(claims.criticalClaims.length) },
    sourceDetail: claims.batchId,
  };

  return [scannerApp, fhirApp, sbsApp, orchestratorApp, nphiesApp, appealApp];
}

function summarizePlatformApps(apps) {
  return {
    total: apps.length,
    stable: apps.filter((app) => app.tone === "stable").length,
    watch: apps.filter((app) => app.tone === "watch").length,
    critical: apps.filter((app) => app.tone === "critical").length,
    live: apps.filter((app) => app.sourceType === "live-service").length,
    embedded: apps.filter((app) => app.sourceType !== "live-service").length,
  };
}

function buildPriorityActions(hospitals, externalServices, claims) {
  const actions = [];

  for (const hospital of hospitals) {
    if (hospital.tone === "critical") {
      actions.push(attachRunbook({
        id: `hospital-${hospital.id}-restore`,
        severity: "critical",
        owner: "Infrastructure Agent",
        target: hospital.nameEn,
        scope: "Hospital",
        title: `Restore ${hospital.nameEn} connectivity`,
        description: `${hospital.nameEn} is ${hospital.healthLabel.toLowerCase()} at ${hospital.subdomain}. Operators cannot reach the Oracle portal.`,
        recommendation: "Check Cloudflare tunnel health, branch network path, and the mapped Oracle origin endpoint.",
        href: hospital.url,
        hrefLabel: "Open branch portal",
        tone: hospital.tone,
        latency: hospital.latency,
      }, "hospital-connectivity"));
    } else if (hospital.tone === "watch") {
      actions.push(attachRunbook({
        id: `hospital-${hospital.id}-latency`,
        severity: "high",
        owner: "Infrastructure Agent",
        target: hospital.nameEn,
        scope: "Hospital",
        title: `Reduce latency for ${hospital.nameEn}`,
        description: `${hospital.nameEn} is online but responding in ${hospital.latency} ms, above the expected operating threshold.`,
        recommendation: "Review tunnel throughput, WAN quality, and Oracle backend saturation before users feel the slowdown.",
        href: hospital.url,
        hrefLabel: "Open branch portal",
        tone: hospital.tone,
        latency: hospital.latency,
      }, "hospital-latency"));
    }
  }

  for (const service of externalServices) {
    if (service.tone === "critical") {
      const isNphies = service.id === "nphies";
      actions.push(attachRunbook({
        id: `external-${service.id}-availability`,
        severity: isNphies ? "critical" : "high",
        owner: isNphies ? "Claims Agent" : "Integration Gateway",
        target: service.nameEn,
        scope: "External Service",
        title: `Investigate ${service.nameEn} availability`,
        description: `${service.nameEn} is ${service.healthLabel.toLowerCase()} from the control tower and may affect claims flow or operator access.`,
        recommendation: isNphies
          ? "Validate NPHIES connectivity immediately before submission and reconciliation queues begin to grow."
          : "Validate provider reachability and prepare an operator fallback path while the service recovers.",
        href: service.url,
        hrefLabel: "Open external service",
        tone: service.tone,
        latency: service.latency,
      }, isNphies ? "nphies-availability" : "external-service-availability"));
    } else if (service.tone === "watch") {
      actions.push(attachRunbook({
        id: `external-${service.id}-latency`,
        severity: "medium",
        owner: service.id === "nphies" ? "Claims Agent" : "Integration Gateway",
        target: service.nameEn,
        scope: "External Service",
        title: `Watch degraded response on ${service.nameEn}`,
        description: `${service.nameEn} is reachable but slower than expected at ${service.latency} ms.`,
        recommendation: "Track the service closely and verify that staff can continue their claims or approval workflow without delay.",
        href: service.url,
        hrefLabel: "Open external service",
        tone: service.tone,
        latency: service.latency,
      }, service.id === "nphies" ? "nphies-availability" : "external-service-latency"));
    }
  }

  if (claims.summary.blockedClaims > 0) {
    actions.push(attachRunbook({
      id: "claims-blocker-recode",
      severity: "critical",
      owner: "Claims Coding",
      target: claims.batchId,
      scope: "Claims",
      title: `Clear ${claims.summary.blockedClaims} blocker claims before resubmission`,
      description: `${claims.summary.blockedClaims} claims and ${claims.payments.blockedServiceItems} disputed service items are blocked by ${claims.rejections.blockerIssue.code}.`,
      recommendation: "Recode blocked bundles first so they can re-enter the ready-for-submission queue before the appeal window closes.",
      href: "/api/control-tower",
      hrefLabel: "Open control-tower API",
      tone: "critical",
      latency: null,
    }, "claims-recode-96092"));
  }

  if (claims.summary.readyClaims > 0 && claims.daysRemaining <= 14) {
    actions.push(attachRunbook({
      id: "claims-deadline-window",
      severity: "high",
      owner: "Revenue Recovery",
      target: claims.batchId,
      scope: "Claims",
      title: `Move ${claims.summary.readyClaims} ready claims inside the ${claims.daysRemaining}-day window`,
      description: `${claims.summary.readyClaims} claims are ready for appeal submission, covering ${claims.payments.recoverableServiceItems} disputed service items still recoverable in the current window.`,
      recommendation: "Push CRITICAL and HIGH bundles through NPHIES and Etimad communication paths before time-at-risk converts into lost recovery.",
      href: "/api/control-tower",
      hrefLabel: "Open control-tower API",
      tone: "watch",
      latency: null,
    }, "claims-deadline-submission"));
  }

  if (claims.approvals.priorAuthClaims > 0) {
    actions.push(attachRunbook({
      id: "claims-prior-auth-backlog",
      severity: claims.approvals.criticalTherapyClaims > 0 ? "high" : "medium",
      owner: "Claims Agent",
      target: claims.batchId,
      scope: "Approvals",
      title: `Resolve prior-authorization backlog across ${claims.approvals.priorAuthClaims} claims`,
      description: `${claims.approvals.criticalTherapyClaims} critical therapy bundles and ${claims.approvals.coverageReviewClaims} coverage-review bundles still depend on approval-quality documentation.`,
      recommendation: "Prioritize chemo, biologic, and specialist medication bundles so missing authorization evidence does not stall payment recovery.",
      href: "/api/control-tower",
      hrefLabel: "Open control-tower API",
      tone: "watch",
      latency: null,
    }, "claims-prior-auth"));
  }

  if ((claims.scanner.latestBatch.errorCount || 0) > 0) {
    actions.push(attachRunbook({
      id: "scanner-batch-errors",
      severity: "high",
      owner: "Integration Gateway",
      target: claims.batchId,
      scope: "Scanner",
      title: `Repair scanner batch failure after ${claims.scanner.latestBatch.errorCount} route errors`,
      description: `The latest scan batch processed ${claims.scanner.latestBatch.processed} of ${claims.scanner.latestBatch.totalEligible} eligible claims and failed with ${claims.scanner.latestBatch.dominantError}.`,
      recommendation: "Fix the worker route path or scanner deployment first, then rerun a single scan before reopening the batch workflow.",
      href: "/api/control-tower",
      hrefLabel: "Open control-tower API",
      tone: "critical",
      latency: null,
    }, "scanner-http-404"));
  }

  if (claims.sourceMode === "fallback-reference") {
    actions.push(attachRunbook({
      id: "scanner-feed-restore",
      severity: "critical",
      owner: "Integration Gateway",
      target: claims.batchId,
      scope: "Platform App",
      title: "Restore live scanner feed to the control tower",
      description: "The control tower is operating on fallback reference claims data because the live scanner feed is unavailable.",
      recommendation: "Repair the scanner service binding or HTTP path first, then rerun a safe claims fetch before resuming operational decisions from the dashboard.",
      href: "/api/control-tower",
      hrefLabel: "Open control-tower API",
      tone: "critical",
      latency: null,
    }, "scanner-http-404"));
  } else if (claims.sourceMode === "watchlist-live") {
    actions.push(attachRunbook({
      id: "scanner-promote-live-batch",
      severity: "medium",
      owner: "Integration Gateway",
      target: claims.batchId,
      scope: "Platform App",
      title: "Promote watchlist telemetry to full live-batch coverage",
      description: "The scanner is live, but portfolio totals are still using the current reference batch because a fresh batch summary is not yet available.",
      recommendation: "Trigger a safe scanner batch replay so the control tower can upgrade from watchlist-live to live-batch mode.",
      href: "/api/control-tower",
      hrefLabel: "Open control-tower API",
      tone: "watch",
      latency: null,
    }, "scanner-http-404"));
  }

  if (!actions.length) {
    actions.push(attachRunbook({
      id: "all-clear",
      severity: "info",
      owner: "Control Tower",
      target: "Network",
      scope: "Operations",
      title: "No urgent actions in queue",
      description: "All monitored hospitals and external healthcare services are operating within the expected thresholds.",
      recommendation: "Continue automatic refresh and use this window to validate new integrations and claims telemetry.",
      href: "/api/control-tower",
      hrefLabel: "Open control-tower API",
      tone: "stable",
      latency: null,
    }, "claims-deadline-submission"));
  }

  return actions
    .sort((left, right) => {
      const severityDiff = ACTION_SEVERITY_ORDER[left.severity] - ACTION_SEVERITY_ORDER[right.severity];
      if (severityDiff !== 0) return severityDiff;
      return (right.latency || 0) - (left.latency || 0);
    })
    .slice(0, 8)
    .map((action, index) => ({ ...action, rank: index + 1 }));
}

function summarizeActions(actions) {
  const actionable = actions.filter(action => action.severity !== "info");
  return {
    total: actionable.length,
    critical: actions.filter(action => action.severity === "critical").length,
    high: actions.filter(action => action.severity === "high").length,
    medium: actions.filter(action => action.severity === "medium").length,
    info: actions.filter(action => action.severity === "info").length,
  };
}

function createControlTowerSnapshot(branchHealth, externalHealth, claims, options = {}) {
  const includeInternals = options.includeInternals === true;
  const includeDetails = options.includeDetails !== false;
  const hospitals = BRANCHES.map(branch => enrichHospital(branch, branchHealth[branch.id]));
  const externalServices = MOH_PORTALS.map(portal => enrichExternalService(portal, externalHealth[portal.id]));
  const platformApps = buildPlatformApps(claims);
  const priorityActions = buildPriorityActions(hospitals, externalServices, claims);
  const hospitalSummary = summarizeServices(hospitals);
  const externalSummary = summarizeServices(externalServices);
  const platformSummary = summarizePlatformApps(platformApps);
  const allResponsive = [...hospitals, ...externalServices].filter(item => item.online);
  const integrations = buildIntegrationSnapshot(hospitals, claims, options.env || {});

  const snapshot = {
    timestamp: new Date().toISOString(),
    meta: {
      refreshIntervalMs: AUTO_REFRESH_INTERVAL_MS,
    },
    summary: {
      hospitals: hospitalSummary,
      externalServices: externalSummary,
      platformApps: platformSummary,
      claims: claims.summary,
      actions: summarizeActions(priorityActions),
      overall: {
        monitoredEndpoints: hospitals.length + externalServices.length,
        operationalSurfaces: hospitals.length + externalServices.length + platformApps.length,
        avgLatencyMs: allResponsive.length
          ? Math.round(allResponsive.reduce((sum, item) => sum + (item.latency || 0), 0) / allResponsive.length)
          : null,
      },
    },
    integrations,
    hospitals,
    externalServices,
    platformApps,
    claims,
    runbooks: buildRunbookIndex(),
    priorityActions,
  };

  if (!includeInternals) {
    snapshot.hospitals = snapshot.hospitals.map(redactHospitalInternals);
    snapshot.priorityActions = snapshot.priorityActions.map(redactActionInternals);
  }

  if (!includeDetails) {
    return {
      timestamp: snapshot.timestamp,
      meta: snapshot.meta,
      summary: snapshot.summary,
      integrations: snapshot.integrations,
      hospitals: snapshot.hospitals.map((hospital) => ({
        id: hospital.id,
        kind: hospital.kind,
        name: hospital.name,
        nameEn: hospital.nameEn,
        region: hospital.region,
        subdomain: hospital.subdomain,
        loginPath: hospital.loginPath,
        url: hospital.url,
        online: hospital.online,
        statusCode: hospital.statusCode,
        latency: hospital.latency,
        error: hospital.error,
        probedAt: hospital.probedAt,
        tone: hospital.tone,
        healthLabel: hospital.healthLabel,
        signal: hospital.signal,
      })),
      externalServices: snapshot.externalServices,
      priorityActions: snapshot.priorityActions.map((action) => ({
        id: action.id,
        severity: action.severity,
        owner: action.owner,
        target: action.target,
        scope: action.scope,
        title: action.title,
        description: action.description,
        tone: action.tone,
        rank: action.rank,
        latency: action.latency,
      })),
    };
  }

  return snapshot;
}

async function buildControlTowerSnapshot(env, options = {}) {
  const [branchHealth, externalHealth, scannerFeed] = await Promise.all([
    probeAllBranches(),
    probeAllExternalPortals(),
    fetchScannerClaimsFeed(env),
  ]);

  const claims = buildClaimsSnapshot(scannerFeed, externalHealth);
  return createControlTowerSnapshot(branchHealth, externalHealth, claims, { ...options, env });
}

function buildIntegrationSnapshot(hospitals, claims, env) {
  const totalHospitals = hospitals.length;
  const onlineHospitals = hospitals.filter((h) => h.online).length;
  const degradedHospitals = hospitals.filter((h) => h.tone === "watch").length;
  const offlineHospitals = hospitals.filter((h) => h.tone === "critical").length;
  const tunnelStatus = offlineHospitals > 0 ? "degraded" : (degradedHospitals > 0 ? "watch" : "healthy");
  const scannerLive = !!claims?.scanner?.liveSystem?.available;

  return {
    generatedAt: new Date().toISOString(),
    repo: {
      name: env.REPO_NAME || "oracle-setup",
      owner: env.REPO_OWNER || "Fadil369",
      branch: env.REPO_BRANCH || "main",
      url: env.REPO_URL || "https://github.com/Fadil369/oracle-setup",
      status: "connected",
      signal: "Repository metadata is connected to the control plane.",
    },
    deploymentApi: {
      status: env.DEPLOY_WEBHOOK_URL ? "connected" : "watch",
      endpoint: "/api/deploy/oracle",
      mode: env.DEPLOY_WEBHOOK_URL ? "webhook-trigger" : "plan-only",
      signal: env.DEPLOY_WEBHOOK_URL
        ? "Deployment API can hand off Oracle stack requests to the configured runner."
        : "Deployment API is available in plan mode; configure DEPLOY_WEBHOOK_URL to enable triggers.",
    },
    tunnel: {
      status: tunnelStatus,
      totalHospitals,
      onlineHospitals,
      degradedHospitals,
      offlineHospitals,
      signal: offlineHospitals > 0
        ? `${offlineHospitals} branch tunnels need remediation.`
        : degradedHospitals > 0
          ? `${degradedHospitals} branch tunnels are reachable but slow.`
          : "All monitored branch tunnels are healthy.",
      runbookHref: "/runbooks/hospital-connectivity",
    },
    portals: {
      status: "healthy",
      url: "https://portals.brainsait.org",
      summaryEndpoint: "/api/control-tower/summary",
      detailEndpoint: "/api/control-tower/details",
      signal: "Portals control plane is serving live snapshots.",
    },
    scanner: {
      status: scannerLive ? "connected" : "degraded",
      mode: claims?.sourceMode || "fallback-reference",
      sourceSummary: claims?.sourceSummary || "Scanner state unavailable",
      signal: scannerLive
        ? "Scanner telemetry is live via service binding or upstream endpoint."
        : "Scanner feed degraded; operating on fallback claim references.",
    },
  };
}

function buildOracleDeploymentPlan(env, payload = {}) {
  const repo = {
    owner: env.REPO_OWNER || "Fadil369",
    name: env.REPO_NAME || "oracle-setup",
    branch: payload.ref || env.REPO_BRANCH || "main",
    url: env.REPO_URL || "https://github.com/Fadil369/oracle-setup",
  };

  const target = payload.target || "local-dev";
  const composeFile = payload.composeFile || (target === "platform" ? "docker-compose.production.yml" : "docker/docker-compose.yml");
  const deployCommand = target === "platform"
    ? `docker compose -f ${composeFile} up -d`
    : `node scripts/brainsait-oracle.mjs deploy --target ${target}`;

  return {
    requestedAt: new Date().toISOString(),
    action: payload.action || "plan",
    target,
    composeFile,
    repo,
    steps: DEPLOYMENT_STEPS,
    commands: {
      configure: "node scripts/brainsait-oracle.mjs configure",
      deploy: deployCommand,
      status: "node scripts/brainsait-oracle.mjs status --format json",
      backup: "node scripts/brainsait-oracle.mjs backup",
    },
    requiredSecrets: [
      "API_KEY",
      "ORACLE_PASSWORD",
      "APP_USER_PASSWORD",
      "CLOUDFLARE_API_TOKEN",
      "DATABASE_URL",
    ],
    capabilities: {
      plan: true,
      validate: true,
      trigger: !!env.DEPLOY_WEBHOOK_URL,
    },
  };
}

function parseOptionalJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function handleOracleDeploy(request, env, url) {
  const accessDenied = await requireAccessJwt(request, env);
  if (accessDenied) return accessDenied;

  const denied = requireApiKey(request, env, url);
  if (denied) return denied;

  if (request.method === "GET") {
    return json({
      deployment: buildOracleDeploymentPlan(env),
      webhookConfigured: !!env.DEPLOY_WEBHOOK_URL,
      endpoint: "/api/deploy/oracle",
    }, 200, { request, env });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, { request, env });
  }

  let payload = {};
  const contentType = request.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    try {
      payload = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400, { request, env });
    }
  }

  const action = payload.action || "plan";
  const deployment = buildOracleDeploymentPlan(env, payload);
  const missingSecrets = deployment.requiredSecrets.filter((name) => !env[name]);

  if (action === "plan" || action === "validate") {
    return json({
      status: action === "validate" ? (missingSecrets.length ? "not-ready" : "ready") : "planned",
      deployment,
      validation: {
        webhookConfigured: !!env.DEPLOY_WEBHOOK_URL,
        missingSecrets,
      },
    }, 200, { request, env });
  }

  if (action !== "trigger") {
    return json({ error: `Unsupported action: ${action}` }, 400, { request, env });
  }

  if (!env.DEPLOY_WEBHOOK_URL) {
    return json({
      error: "DEPLOY_WEBHOOK_URL is not configured",
      deployment,
    }, 501, { request, env });
  }

  const operator = request.headers.get("CF-Access-Authenticated-User-Email") || "api-key-client";
  const webhookHeaders = {
    "Content-Type": "application/json",
  };

  if (env.DEPLOY_WEBHOOK_TOKEN) {
    webhookHeaders.Authorization = `Bearer ${env.DEPLOY_WEBHOOK_TOKEN}`;
  }

  const webhookResponse = await fetch(env.DEPLOY_WEBHOOK_URL, {
    method: "POST",
    headers: webhookHeaders,
    body: JSON.stringify({
      ...deployment,
      operator,
      metadata: payload.metadata || null,
      dryRun: payload.dryRun === true,
      source: "portals.brainsait.org/api/deploy/oracle",
    }),
  });

  const responseText = await webhookResponse.text();
  return json({
    status: webhookResponse.ok ? "accepted" : "rejected",
    deployment,
    webhook: {
      url: env.DEPLOY_WEBHOOK_URL,
      status: webhookResponse.status,
      body: parseOptionalJson(responseText),
    },
  }, webhookResponse.ok ? 202 : 502, { request, env });
}

function parseAllowedOrigins(env, fallback = []) {
  const raw = env.CORS_ALLOWED_ORIGINS || "";
  const parsed = raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
}

function resolveCorsOrigin(request, env) {
  const allowed = parseAllowedOrigins(env, ["https://portals.brainsait.org"]);
  const origin = request.headers.get("Origin");

  if (!origin) return allowed[0] || null;
  if (allowed.includes("*")) return "*";
  if (allowed.includes(origin)) return origin;
  return null;
}

function corsHeaders(request, env, methods) {
  const origin = resolveCorsOrigin(request, env);
  if (!origin) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, CF-Access-Jwt-Assertion",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function pemToArrayBuffer(pem) {
  const b64 = pem
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\s+/g, "");
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

function b64urlToUint8Array(input) {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function parseJwtHeader(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const headerRaw = new TextDecoder().decode(b64urlToUint8Array(parts[0]));
  return JSON.parse(headerRaw);
}

function parseJwtPayload(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payloadRaw = new TextDecoder().decode(b64urlToUint8Array(parts[1]));
  return JSON.parse(payloadRaw);
}

async function verifyAccessJwt(token, env) {
  const parts = token.split(".");
  if (parts.length !== 3) return { valid: false, reason: "Malformed token" };

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = parseJwtHeader(token);
  if (!header) return { valid: false, reason: "Malformed token header" };
  if (header.alg !== "RS256") return { valid: false, reason: "Unsupported token algorithm" };

  const payload = parseJwtPayload(token);
  if (!payload) return { valid: false, reason: "Invalid token payload" };

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp < now) return { valid: false, reason: "Token expired" };
  if (typeof payload.nbf === "number" && payload.nbf > now) return { valid: false, reason: "Token not active yet" };

  const audience = env.CF_ACCESS_AUD;
  const audClaim = payload.aud;
  const audOk = Array.isArray(audClaim) ? audClaim.includes(audience) : audClaim === audience;
  if (!audOk) return { valid: false, reason: "Invalid token audience" };

  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = b64urlToUint8Array(signatureB64);

  const certUrl = env.CF_ACCESS_CERTS_URL
    || (env.CF_ACCESS_TEAM_DOMAIN ? `https://${env.CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs` : null);

  if (certUrl) {
    const certs = await fetchCfAccessCerts(certUrl);
    const candidates = header.kid
      ? certs.filter((jwk) => jwk.kid === header.kid)
      : certs;

    for (const jwk of candidates) {
      try {
        const key = await crypto.subtle.importKey(
          "jwk",
          jwk,
          { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
          false,
          ["verify"]
        );
        const validSig = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signedData);
        if (validSig) return { valid: true, payload };
      } catch {
        // Try next key.
      }
    }
    if (!env.CF_ACCESS_JWT_PUBLIC_KEY) {
      return { valid: false, reason: "Invalid token signature" };
    }
  }

  if (env.CF_ACCESS_JWT_PUBLIC_KEY) {
    const key = await crypto.subtle.importKey(
      "spki",
      pemToArrayBuffer(env.CF_ACCESS_JWT_PUBLIC_KEY),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const validSig = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signedData);
    if (!validSig) return { valid: false, reason: "Invalid token signature" };
    return { valid: true, payload };
  }

  return { valid: false, reason: "No verification key configured" };
}

const CERTS_CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchCfAccessCerts(url) {
  const cache = globalThis.__cfAccessCertCache || (globalThis.__cfAccessCertCache = new Map());
  const now = Date.now();
  const cached = cache.get(url);
  if (cached && cached.expiresAt > now) return cached.keys;

  const response = await fetch(url, { method: "GET" });
  if (!response.ok) throw new Error(`Failed to fetch Access certs (${response.status})`);

  const payload = await response.json();
  const keys = Array.isArray(payload?.keys) ? payload.keys : [];
  if (!keys.length) throw new Error("Access cert response had no keys");

  const cacheControl = response.headers.get("Cache-Control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const ttlMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : CERTS_CACHE_TTL_MS;

  cache.set(url, { keys, expiresAt: now + Math.max(ttlMs, 30_000) });
  return keys;
}

async function requireAccessJwt(request, env) {
  const requireCfAccess = env.REQUIRE_CF_ACCESS === "1" || env.REQUIRE_CF_ACCESS === "true";
  if (!requireCfAccess) return null;

  const certUrl = env.CF_ACCESS_CERTS_URL
    || (env.CF_ACCESS_TEAM_DOMAIN ? `https://${env.CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs` : null);

  if ((!env.CF_ACCESS_JWT_PUBLIC_KEY && !certUrl) || !env.CF_ACCESS_AUD) {
    return json(
      { error: "Server misconfigured: configure CF_ACCESS_AUD and either CF_ACCESS_CERTS_URL/CF_ACCESS_TEAM_DOMAIN or CF_ACCESS_JWT_PUBLIC_KEY" },
      503,
      { request, env }
    );
  }

  const token =
    request.headers.get("CF-Access-Jwt-Assertion") ||
    request.headers.get("cf-access-jwt-assertion") ||
    "";

  if (!token) {
    return json({ error: "Missing Cloudflare Access token" }, 401, { request, env });
  }

  try {
    const verification = await verifyAccessJwt(token, env);
    if (!verification.valid) {
      return json({ error: "Invalid Cloudflare Access token", reason: verification.reason }, 401, { request, env });
    }
  } catch (error) {
    return json({ error: "Cloudflare Access token verification failed", reason: error.message }, 401, { request, env });
  }
  return null;
}

// ── Rate limiter (KV-backed, per IP, sliding 60-second window) ───────────────
// Limits requests to expensive live-probe endpoints to prevent abuse.
// Gracefully skips if PORTAL_KV is not provisioned.
async function checkRateLimit(request, env, limit = 30) {
  if (!env.PORTAL_KV) return null; // KV not provisioned — skip gracefully

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const window = Math.floor(Date.now() / 60_000); // 1-minute window
  const key = `ratelimit:${ip}:${window}`;

  let count = 0;
  try {
    const stored = await env.PORTAL_KV.get(key, "text");
    count = stored ? parseInt(stored, 10) : 0;
  } catch {
    return null; // KV read failed — allow the request
  }

  if (count >= limit) {
    return json(
      { error: "Too many requests. Please wait before retrying.", retryAfterSeconds: 60 },
      429,
      { "Retry-After": "60", "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": "0" }
    );
  }

  // Increment counter asynchronously — don't block the response
  env.PORTAL_KV.put(key, String(count + 1), { expirationTtl: 120 }).catch(() => {});
  return null;
}

// ── API key guard helper ──────────────────────────────────────────────────────
function requireApiKey(request, env, url) {
  const allowUnauthenticated = env.ALLOW_UNAUTHENTICATED === "1" || env.ALLOW_UNAUTHENTICATED === "true";
  if (!env.API_KEY && !allowUnauthenticated) {
    return json({ error: "Server misconfigured: API_KEY is required" }, 503);
  }
  if (!env.API_KEY) return null;

  const auth = request.headers.get("Authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const provided =
    bearer ||
    request.headers.get("X-API-Key") ||
    request.headers.get("x-api-key") ||
    url.searchParams.get("api_key") ||
    url.searchParams.get("key");

  if (provided !== env.API_KEY) {
    return json({ error: "Unauthorized" }, 401);
  }
  return null;
}

// ── Main fetch handler ────────────────────────────────────────────────────────
export default {
  // ── HTTP requests ─────────────────────────────────────────────────────────
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const requestId = crypto.randomUUID();

    if (url.hostname === "www.brainsait.org") {
      url.hostname = "brainsait.org";
      return Response.redirect(url.toString(), 301);
    }

    // CORS preflight
    if (request.method === "OPTIONS") {
      const headers = corsHeaders(request, env, "GET, POST, OPTIONS");
      if (!headers) {
        return new Response(JSON.stringify({ error: "Origin not allowed" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(null, {
        status: 204,
        headers,
      });
    }

    // Platform health metadata. Preserve text/plain for simple legacy probes.
    if (path === "/health") {
      const accept = request.headers.get("Accept") || "";
      if (accept.includes("text/plain")) {
        return new Response("ok", {
          status: 200,
          headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-store", ...SEC_HEADERS },
        });
      }

      return json(buildPlatformHealthPayload(), 200, { request, env });
    }

    if (path === "/robots.txt") {
      return new Response("User-agent: *\nAllow: /\nSitemap: https://brainsait.org/sitemap.xml\n", {
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    if (path === "/sitemap.xml") {
      return new Response(renderSitemapXml(), {
        headers: {
          "Content-Type": "application/xml;charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    if (path === "/api/runbooks") {
      return json(buildRunbookIndex());
    }

    if (path.startsWith("/api/runbooks/")) {
      const runbookId = path.split("/api/runbooks/")[1];
      const runbook = RUNBOOKS[runbookId];
      if (!runbook) return json({ error: `Unknown runbook: ${runbookId}` }, 404);
      return json({
        ...runbook,
        href: `/runbooks/${runbook.id}`,
        escalationHref: `/runbooks/${runbook.id}#escalation`,
      });
    }

    if (path.startsWith("/runbooks/")) {
      const runbookId = path.split("/runbooks/")[1];
      const runbook = RUNBOOKS[runbookId];
      if (!runbook) {
        return new Response("Runbook not found", { status: 404 });
      }
      return htmlResponse(renderRunbookPage(runbook));
    }

    if (path === "/api/control-tower/summary") {
      if (env.PORTAL_KV) {
        const cached = await env.PORTAL_KV.get("control-tower:summary:latest", "text");
        if (cached) {
          return new Response(cached, {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "public, max-age=300, stale-if-error=600",
              "X-Cache": "HIT",
              ...SEC_HEADERS,
            },
          });
        }
      }
      const summarySnapshot = await buildControlTowerSnapshot(env, {
        includeInternals: false,
        includeDetails: false,
      });
      return json(summarySnapshot, 200, { request, env, "X-Cache": "MISS" });
    }

    if (path === "/api/control-tower/details") {
      if (env.PORTAL_KV) {
        const cached = await env.PORTAL_KV.get("control-tower:details:latest", "text");
        if (cached) {
          return new Response(cached, {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "public, max-age=300, stale-if-error=600",
              "X-Cache": "HIT",
              ...SEC_HEADERS,
            },
          });
        }
      }
      const detailSnapshot = await buildControlTowerSnapshot(env, {
        includeInternals: false,
        includeDetails: true,
      });
      return json({
        timestamp: detailSnapshot.timestamp,
        meta: detailSnapshot.meta,
        summary: {
          claims: detailSnapshot.summary.claims,
          actions: detailSnapshot.summary.actions,
        },
        claims: detailSnapshot.claims,
        runbooks: detailSnapshot.runbooks,
        priorityActions: detailSnapshot.priorityActions,
        integrations: detailSnapshot.integrations,
      }, 200, { request, env, "X-Cache": "MISS" });
    }

    if (path === "/api/integrations") {
      const integrationSnapshot = await buildControlTowerSnapshot(env, {
        includeInternals: false,
        includeDetails: false,
      });
      return json(integrationSnapshot.integrations, 200, { request, env });
    }

    if (path === "/api/control-tower") {
      const accessDenied = await requireAccessJwt(request, env);
      if (accessDenied) return accessDenied;
      const denied = requireApiKey(request, env, url);
      if (denied) return denied;
      const rateLimited = await checkRateLimit(request, env, 10);
      if (rateLimited) return rateLimited;
      const snapshot = await buildControlTowerSnapshot(env, {
        includeInternals: true,
        includeDetails: true,
      });
      return json(snapshot, 200, { "X-Request-ID": requestId });
    }

    if (path === "/api/deploy/oracle") {
      return handleOracleDeploy(request, env, url);
    }

    if (path === "/api/platform-apps") {
      const snapshot = await buildControlTowerSnapshot(env);
      return json({
        timestamp: snapshot.timestamp,
        summary: snapshot.summary.platformApps,
        apps: snapshot.platformApps,
      }, 200, { request, env });
    }

    if (path.startsWith("/api/scan/")) {
      const branchId = decodeURIComponent(path.split("/api/scan/")[1] || "");
      const branch = BRANCHES.find(b => b.id === branchId);
      if (!branch) {
        return json({
          error: `Unknown branch: ${branchId}`,
          tone: "red",
          message: `Branch ${branchId} is not registered in the BrainSAIT control tower.`,
        }, 404, { request, env });
      }

      const hasAuthenticatedIntent = Boolean(
        request.headers.get("Authorization")
        || request.headers.get("X-API-Key")
        || request.headers.get("x-api-key")
        || request.headers.get("CF-Access-Jwt-Assertion")
        || request.headers.get("cf-access-jwt-assertion")
        || url.searchParams.get("api_key")
        || url.searchParams.get("key")
      );

      if (hasAuthenticatedIntent) {
        const accessDenied = await requireAccessJwt(request, env);
        if (accessDenied) return accessDenied;
        const denied = requireApiKey(request, env, url);
        if (denied) return denied;

        const scanPath = `/scan?branch=${encodeURIComponent(branchId)}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30_000);

        try {
          const response = env.SCANNER_SERVICE
            ? await env.SCANNER_SERVICE.fetch(`https://scanner.internal${scanPath}`, {
                method: request.method === "POST" ? "POST" : "GET",
                headers: { Accept: "application/json" },
              })
            : await fetch(
                normalizeUrl(env.SCANNER_URL || "https://oracle-scanner.brainsait.org", scanPath),
                {
                  method: request.method === "POST" ? "POST" : "GET",
                  headers: { Accept: "application/json" },
                  signal: controller.signal,
                }
              );

          const body = await response.text();
          return new Response(body, {
            status: response.status,
            headers: {
              "Content-Type": response.headers.get("Content-Type") || "application/json",
              "Access-Control-Allow-Origin": resolveCorsOrigin(request, env) || "https://portals.brainsait.org",
              Vary: "Origin",
              "Cache-Control": "no-store",
            },
          });
        } catch (error) {
          return json({
            error: error.name === "AbortError" ? "timeout" : error.message,
            branch: branchId,
          }, 502, { request, env });
        } finally {
          clearTimeout(timer);
        }
      }

      const health = await probeBranch(branch);
      const portalUrl = `https://${branch.subdomain}${branch.loginPath}`;
      const portalSignal = health.online
        ? "The Oracle portal is reachable right now."
        : `The Oracle portal is currently unreachable${health.error ? ` (${health.error})` : ""}.`;

      return json({
        branch: {
          id: branch.id,
          name: branch.name,
          nameEn: branch.nameEn,
          region: branch.region,
          url: portalUrl,
        },
        scanReady: false,
        tone: health.online ? "amber" : "red",
        message: `Direct scans for ${branch.nameEn} require a national ID and bundle ID. Open the BrainSAIT Control Tower to continue. ${portalSignal}`,
        controlTowerUrl: "https://brainsait.org/control-tower",
        advisory: {
          reason: "missing-claim-identifiers",
          requiredFields: ["nationalId", "bundleId"],
          recommendedAction: "Use the branch Oracle portal or the Control Tower watchlist, then submit the secured scan with the live claim identifiers.",
        },
        health,
      }, 202, { request, env });
    }

    // JSON health of all branches
    if (path === "/api/health") {
      const rateLimited = await checkRateLimit(request, env, 20);
      if (rateLimited) return rateLimited;
      const health = await probeAllBranches();
      const online = Object.values(health).filter(h => h.online).length;
      return json({
        ...buildPlatformHealthPayload({
          status: online === BRANCHES.length ? "operational" : (online > 0 ? "degraded" : "outage"),
          hospitalsOnline: online,
          hospitalsTotal: BRANCHES.length,
          timestamp: new Date().toISOString(),
        }),
        timestamp: new Date().toISOString(),
        summary:   { total: BRANCHES.length, online, offline: BRANCHES.length - online },
        branches:  health,
        mohPortals: MOH_PORTALS.map(p => ({ id: p.id, name: p.nameEn, url: p.url })),
      });
    }

    // JSON health of one branch (public)
    if (path.startsWith("/api/health/")) {
      const id = path.split("/api/health/")[1];
      const branch = BRANCHES.find(b => b.id === id);
      if (!branch) return json({ error: `Unknown branch: ${id}` }, 404);
      const result = await probeBranch(branch);
      return json(result);
    }

    // Branch config (public)
    if (path === "/api/branches") {
      return json(BRANCHES.map(b => ({
        id:       b.id,
        name:     b.name,
        nameEn:   b.nameEn,
        region:   b.region,
        url:      `https://${b.subdomain}${b.loginPath}`,
        subdomain: b.subdomain,
        loginPath: b.loginPath,
      })));
    }

    if (path === "/api/infrastructure") {
      const snapshot = await buildControlTowerSnapshot(env);
      return json(buildInfrastructureSnapshot(snapshot), 200, { request, env });
    }

    // ── MAOS — Multi-Agent Operating System endpoints ────────────────────────
    if (path === "/api/maos" || path === "/api/maos/status") {
      return json({
        platform: "BrainSAIT eCarePlus",
        system: "MAOS — Multi-Agent Operating System",
        version: MAOS_SYSTEM_INFO.version,
        status: "operational",
        timestamp: new Date().toISOString(),
        modules: MAOS_SYSTEM_INFO.modules,
        agentTeams: MAOS_SYSTEM_INFO.agentTeams,
        scenarios: MAOS_SYSTEM_INFO.scenarios,
        desktopTemplates: MAOS_SYSTEM_INFO.desktopTemplates,
        agents: MCP_AGENT_NETWORK,
        agentCount: MCP_AGENT_NETWORK.length,
      }, 200, { request, env });
    }

    if (path === "/api/maos/agents") {
      return json({
        agents: MCP_AGENT_NETWORK.map(name => ({
          name,
          status: "active",
          gateway: "https://mcp.brainsait.org",
        })),
        total: MCP_AGENT_NETWORK.length,
      }, 200, { request, env });
    }

    // ── Hospital Simulation ───────────────────────────────────────────────────
    if (path === "/api/simulate" || path === "/simulate_hospital_case") {
      const scenarios = MAOS_SYSTEM_INFO.scenarios[0].scenarios.map((id) => ({
        id,
        name: id.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" "),
        agents: 6,
      }));
      if (request.method === "GET") {
        return json({
          platform: "BrainSAIT eCarePlus",
          service: "Hospital Simulation",
          description: "Digital twin hospital environment for training and validating LINC agents",
          availableScenarios: scenarios,
          endpoint: "POST /api/simulate",
          requiredPayload: { scenario_id: "string (optional)" },
          pipeline: ["patient_presentation", "nurse_triage", "doctor_assessment", "lab_analysis", "consultant_opinion", "risk_analysis"],
        }, 200, { request, env });
      }
      let scenarioId = "cardiac-chest-pain";
      try { const b = await request.json(); scenarioId = b.scenario_id || scenarioId; } catch {}
      const pick = scenarios.find(s => s.id === scenarioId) || scenarios[0];
      return json({
        simulation_id: `sim-${Date.now()}`,
        scenario: pick.id,
        status: "completed",
        pipeline: {
          patient: { chief_complaint: "Simulated patient presentation", severity: pick.id.includes("diabetic") ? "critical" : "high" },
          triage: { esi_level: pick.id.includes("diabetic") ? 1 : 2, area: "Resuscitation" },
          doctor: { primary_suspicion: pick.name, differentials: [pick.name, "Rule out secondary causes"] },
          lab: { status: "completed", critical_values: pick.id.includes("cardiac") ? ["troponin"] : [] },
          risk: { level: pick.id.includes("diabetic") ? "critical" : "high", alerts: [] },
        },
        outcome: { diagnosis: pick.name, agents_involved: pick.agents },
        meta: { environment: "simulation", platform: "BrainSAIT eCarePlus", timestamp: new Date().toISOString() },
      }, 200, { request, env });
    }

    // ── Research Lab ─────────────────────────────────────────────────────────
    if (path === "/api/research" || path === "/research/analyze") {
      if (request.method === "GET") {
        return json({
          platform: "BrainSAIT eCarePlus",
          service: "Research Automation Lab",
          description: "Multi-agent research pipeline: literature → hypothesis → critic → experiment → peer review",
          endpoint: "POST /api/research",
          requiredPayload: { question: "string", context: "string (optional)", max_sources: "number (optional)" },
          pipeline: ["literature_search", "hypothesis_generation", "critical_evaluation", "experiment_design", "peer_review"],
          agents: 5,
        }, 200, { request, env });
      }
      let question = "Healthcare AI research";
      try { const b = await request.json(); question = b.question || question; } catch {}
      return json({
        research_id: `res-${Date.now()}`,
        question,
        status: "completed",
        pipeline: {
          literature: { sources_found: 10, databases: ["PubMed", "ClinicalTrials.gov", "Cochrane"] },
          hypothesis: { count: 3, recommended: "H1" },
          evaluation: { verdict: "Testable with refinements", score: 7 },
          experiment: { design: "Pragmatic RCT", duration_months: 12, sample_size: 500 },
          peer_review: { verdict: "Accept with minor revisions", publishability: "High" },
        },
        summary: { sources_reviewed: 10, hypotheses_generated: 3, study_design: "Pragmatic RCT", review_verdict: "Accept with minor revisions" },
        meta: { environment: "research_lab", platform: "BrainSAIT eCarePlus", agents_involved: 5, timestamp: new Date().toISOString() },
      }, 200, { request, env });
    }

    // ── n8n Automation Webhooks ───────────────────────────────────────────────
    if (path.startsWith("/workflow/")) {
      if (request.method !== "POST") {
        return json({ platform: "BrainSAIT eCarePlus", service: "Automation Workflows", endpoint: path, method: "POST" }, 200, { request, env });
      }
      return json({ accepted: true, workflow: path.split("/workflow/")[1], status: "queued", timestamp: new Date().toISOString() }, 202, { request, env });
    }

    // ── Telegram Bot Webhook ──────────────────────────────────────────────────
    if (path === "/telegram/webhook") {
      if (request.method !== "POST") return json({ error: "POST required" }, 405);
      try {
        const body = await request.json();
        const message = body.message || {};
        const text = message.text || "";
        const chatId = message.chat?.id;
        if (!chatId || !text) return json({ status: "ignored" });
        const parts = text.trim().split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1).join(" ");
        const responses = {
          "/start": `مرحبا! 🧠\n\nWelcome to *BrainSAIT Super-Bot*\n\nType /help to see available commands.`,
          "/help": `🧠 *BrainSAIT Super-Bot*\n\n*/ai* <query> — Ask AI\n*/simulate* <scenario> — Hospital simulation\n*/research* <topic> — Research lab\n*/status* — Platform status\n*/server* — Infrastructure status`,
          "/status": `📊 *BrainSAIT Platform Status*\n\n• Platform: v5.0.0\n• Agents: ${MCP_AGENT_NETWORK.length} LINC agents active\n• Hospitals: 6 connected\n• Services: Operational\n• Updated: ${new Date().toUTCString()}`,
        };
        const reply = responses[cmd] || `🤖 Command received: \`${cmd}\`\n_Args: ${args || "none"}_\n\nRouting to MAOS...`;
        return json({ method: "sendMessage", chat_id: chatId, text: reply, parse_mode: "Markdown" });
      } catch { return json({ error: "Invalid payload" }, 400); }
    }

    if (
      path === "/"
      || path === "/index"
      || path === "/index.html"
      || path === "/status"
      || path === "/control-tower"
      || EDGE_SERVICE_ROUTE_MAP.has(path)
    ) {
      try {
        const snapshot = await buildControlTowerSnapshot(env, {
          includeInternals: false,
          includeDetails: true,
        });

        if (path === "/status") {
          return htmlResponse(renderStatusPage(snapshot));
        }

        if (path === "/control-tower") {
          return htmlResponse(renderDashboard(snapshot));
        }

        if (EDGE_SERVICE_ROUTE_MAP.has(path)) {
          return htmlResponse(renderServiceEntryPage(EDGE_SERVICE_ROUTE_MAP.get(path), snapshot));
        }

        return htmlResponse(renderLandingPage(snapshot));
      } catch (err) {
        console.error("HTML render failed:", err.message);
        const retryHref = path === "/control-tower" ? "/control-tower" : "/";
        return htmlResponse(
          `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Unavailable</title></head>` +
          `<body style="font-family:sans-serif;padding:2rem"><h1>Page temporarily unavailable</h1>` +
          `<p>Service error. Please retry.</p><a href="${retryHref}">Retry</a></body></html>`,
          503
        );
      }
    }

    return new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain;charset=utf-8", ...SEC_HEADERS },
    });
  },

  // ── Cron: probe every 5 min, store in KV ─────────────────────────────────
  async scheduled(event, env, ctx) {
    if (!env.PORTAL_KV) return; // KV not yet provisioned — skip silently
    try {
      const [branchHealth, externalHealth] = await Promise.all([
        probeAllBranches(),
        probeAllExternalPortals(),
      ]);
      const claims = buildClaimsSnapshot(await fetchScannerClaimsFeed(env), externalHealth);
      const snapshot = createControlTowerSnapshot(branchHealth, externalHealth, claims, {
        includeInternals: true,
        includeDetails: true,
      });
      const summarySnapshot = createControlTowerSnapshot(branchHealth, externalHealth, claims, {
        includeInternals: false,
        includeDetails: false,
      });
      const detailSnapshot = createControlTowerSnapshot(branchHealth, externalHealth, claims, {
        includeInternals: false,
        includeDetails: true,
      });
      await env.PORTAL_KV.put(
        "health:latest",
        JSON.stringify({ timestamp: snapshot.timestamp, branches: branchHealth }),
        { expirationTtl: 600 }
      );
      await env.PORTAL_KV.put(
        "control-tower:latest",
        JSON.stringify(snapshot),
        { expirationTtl: 600 }
      );
      await env.PORTAL_KV.put(
        "control-tower:summary:latest",
        JSON.stringify(summarySnapshot),
        { expirationTtl: 600 }
      );
      await env.PORTAL_KV.put(
        "control-tower:details:latest",
        JSON.stringify({
          timestamp: detailSnapshot.timestamp,
          meta: detailSnapshot.meta,
          summary: {
            claims: detailSnapshot.summary.claims,
            actions: detailSnapshot.summary.actions,
          },
          claims: detailSnapshot.claims,
          runbooks: detailSnapshot.runbooks,
          priorityActions: detailSnapshot.priorityActions,
        }),
        { expirationTtl: 600 }
      );
    } catch (err) {
      // Non-fatal: log to CF Logpush if available
      console.error("Cron health probe failed:", err.message);
    }
  },
};

// ── Dashboard HTML ────────────────────────────────────────────────────────────
function renderRunbookPage(runbook) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${runbook.title}</title>
<style>
  @import url("https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap");

  :root {
    --bg: #08141a;
    --panel: rgba(9, 27, 33, 0.9);
    --line: rgba(125, 169, 173, 0.2);
    --text: #edf8f6;
    --muted: #96b4b0;
    --cyan: #4ed6c5;
    --amber: #f2b766;
    --radius: 24px;
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    font-family: "Sora", sans-serif;
    color: var(--text);
    background: linear-gradient(180deg, #071116 0%, #09161c 100%);
  }

  .page {
    width: min(920px, calc(100% - 32px));
    margin: 0 auto;
    padding: 28px 0 48px;
  }

  .panel {
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
    padding: 28px;
    margin-bottom: 20px;
  }

  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--cyan);
    font-size: 0.72rem;
    margin: 0 0 12px;
  }

  h1, h2 { margin: 0; }
  p, li { color: var(--muted); line-height: 1.7; }
  ol { margin: 18px 0 0; padding-left: 20px; }
  li + li { margin-top: 10px; }
  .pill {
    display: inline-flex;
    align-items: center;
    padding: 8px 12px;
    border-radius: 999px;
    background: rgba(242, 183, 102, 0.12);
    color: var(--amber);
    font-size: 0.74rem;
    margin-right: 8px;
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 20px;
  }

  .links a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 12px 16px;
    border-radius: 999px;
    text-decoration: none;
    border: 1px solid var(--line);
    color: var(--text);
    background: rgba(255,255,255,0.03);
  }
  .links a.primary {
    background: linear-gradient(135deg, var(--cyan), #1da88f);
    color: #062029;
    border: none;
  }
</style>
</head>
<body>
  <main class="page">
    <section class="panel">
      <p class="eyebrow">Runbook</p>
      <h1>${runbook.title}</h1>
      <p>${runbook.summary}</p>
      <div style="margin-top:18px;">
        <span class="pill">Owner: ${runbook.owner}</span>
      </div>
      <div class="links">
        <a class="primary" href="/control-tower">Return to control tower</a>
        <a href="/api/runbooks/${runbook.id}" target="_blank" rel="noopener noreferrer">Open JSON</a>
      </div>
    </section>
    <section class="panel">
      <p class="eyebrow">Remediation path</p>
      <h2>Steps</h2>
      <ol>
        ${runbook.steps.map((step) => `<li>${step}</li>`).join("")}
      </ol>
    </section>
    <section class="panel" id="escalation">
      <p class="eyebrow">Escalation</p>
      <h2>${runbook.escalation.label}</h2>
      <p>${runbook.escalation.when}</p>
      <p>Escalation owner: ${runbook.escalation.team}</p>
    </section>
  </main>
</body>
</html>`;
}

function serializeForInlineScript(data) {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function escapeHtmlText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${Math.round(value)}%` : "—";
}

function formatLatency(value) {
  return Number.isFinite(value) ? `${Math.round(value)} ms` : "—";
}

function formatRatio(active, total, suffix) {
  return Number.isFinite(total) && total > 0
    ? `${active || 0}/${total} ${suffix}`
    : `0 ${suffix}`;
}

function normalizePath(pathname) {
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function buildInfrastructureSnapshot(snapshot) {
  const liveSummary = snapshot.summary || {};
  return {
    timestamp: snapshot.timestamp,
    version: PLATFORM_VERSION,
    company: INFRASTRUCTURE_REFERENCE.company,
    operations: INFRASTRUCTURE_REFERENCE.operations,
    cloudflareAccountId: INFRASTRUCTURE_REFERENCE.cloudflareAccountId,
    oid: INFRASTRUCTURE_REFERENCE.oid,
    primaryDomain: INFRASTRUCTURE_REFERENCE.primaryDomain,
    referenceDomains: INFRASTRUCTURE_REFERENCE.referenceDomains,
    edgeModel: INFRASTRUCTURE_REFERENCE.edgeModel,
    inventory: {
      workers: INFRASTRUCTURE_REFERENCE.activeWorkers,
      d1Databases: INFRASTRUCTURE_REFERENCE.d1Databases,
      kvNamespaces: INFRASTRUCTURE_REFERENCE.kvNamespaces,
      hospitalBranches: BRANCHES.length,
      agents: MCP_AGENT_NETWORK.length,
    },
    networkStack: INFRASTRUCTURE_REFERENCE.networkStack,
    platformLayers: {
      bos: "BrainSAIT Operating System orchestration layer",
      bot: "BrainSAIT Operational Tools automation layer",
      mcpGateway: "https://mcp.brainsait.org",
      simulatedHospital: "https://simulation.brainsait.org",
    },
    agentNetwork: MCP_AGENT_NETWORK,
    stackLayers: PORTAL_STACK_LAYERS,
    compliance: COMPLIANCE_PROFILE,
    serviceDirectory: EDGE_SERVICE_DIRECTORY.map((service) => ({
      aliases: service.aliases || [],
      audience: service.audience,
      category: service.category,
      description: service.description,
      features: service.features,
      launchHref: service.launchHref || null,
      launchLabel: service.launchLabel || null,
      path: service.path,
      kind: service.kind || "support",
      slug: service.slug,
      shortName: service.shortName,
      title: service.title,
      host: service.host,
      tone: service.tone || "white",
      relatedLinks: service.relatedLinks || [],
    })),
    liveSummary,
  };
}

function derivePlatformStatus(summary = {}) {
  const hospitals = summary.hospitals || {};
  const externalServices = summary.externalServices || {};
  const platformApps = summary.platformApps || {};
  const actions = summary.actions || {};

  const hospitalOffline = Math.max(0, (hospitals.total || 0) - (hospitals.online || 0));
  const externalCritical = externalServices.critical || 0;
  const appCritical = platformApps.critical || 0;
  const criticalActions = actions.critical || 0;

  if (hospitalOffline === 0 && externalCritical === 0 && appCritical === 0 && criticalActions === 0) {
    return "operational";
  }

  if ((hospitals.online || 0) > 0 || (externalServices.online || 0) > 0 || (platformApps.live || 0) > 0) {
    return "degraded";
  }

  return "outage";
}

function buildPlatformHealthPayload(options = {}) {
  const timestamp = options.timestamp || new Date().toISOString();
  const hospitalsTotal = Number.isFinite(options.hospitalsTotal) ? options.hospitalsTotal : BRANCHES.length;
  const payload = {
    platform: "BrainSAIT eCarePlus",
    version: PLATFORM_VERSION,
    status: options.status || "operational",
    agents: MCP_AGENT_NETWORK.length,
    hospitals: hospitalsTotal,
    compliance: COMPLIANCE_PROFILE,
    agentGateway: "https://mcp.brainsait.org",
    timestamp,
  };

  if (Number.isFinite(options.hospitalsOnline)) {
    payload.summary = {
      total: hospitalsTotal,
      online: options.hospitalsOnline,
      offline: Math.max(0, hospitalsTotal - options.hospitalsOnline),
    };
  }

  return payload;
}

function renderSitemapXml() {
  const urls = Array.from(new Set([
    "/",
    "/control-tower",
    "/status",
    "/api/infrastructure",
    "/health",
    "/robots.txt",
    ...EDGE_SERVICE_DIRECTORY.flatMap((service) => [service.path, ...(service.aliases || [])]),
    ...Object.keys(RUNBOOKS).map((id) => `/runbooks/${id}`),
  ]));

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((path) => `  <url><loc>https://brainsait.org${path}</loc></url>`).join("\n")}
</urlset>`;
}

function getDesignSystem() {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

    :root {
      --bs-void: #050810;
      --bs-deep: #0a0e1a;
      --bs-navy: #0f1629;
      --bs-surface: #141b2d;
      --bs-card: #1a2236;
      --bs-border: rgba(255,255,255,0.06);
      --bs-border-glow: rgba(212,165,116,0.15);
      --bs-gold: #d4a574;
      --bs-gold-bright: #e8c49a;
      --bs-teal: #0ea5e9;
      --bs-teal-dim: rgba(14,165,233,0.15);
      --bs-medical: #2b6cb8;
      --bs-emerald: #10b981;
      --bs-rose: #f43f5e;
      --bs-amber: #f59e0b;
      --bs-text: #e2e8f0;
      --bs-text-dim: #94a3b8;
      --bs-text-muted: #64748b;
      --bs-glass: rgba(20,27,45,0.7);
      --bs-glass-hover: rgba(26,34,54,0.85);
      --bs-radius: 16px;
      --bs-radius-sm: 10px;
      --bs-radius-xs: 6px;
      --bs-font-display: 'Syne', sans-serif;
      --bs-font-arabic: 'IBM Plex Sans Arabic', sans-serif;
      --bs-font-mono: 'JetBrains Mono', monospace;
      --bs-font-body: 'IBM Plex Sans Arabic', 'Syne', sans-serif;
      --bs-shadow: 0 4px 30px rgba(0,0,0,0.4);
      --bs-shadow-glow: 0 0 40px rgba(212,165,116,0.08);
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    html {
      scroll-behavior: smooth;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    body {
      background: var(--bs-void);
      color: var(--bs-text);
      font-family: var(--bs-font-body);
      font-size: 15px;
      line-height: 1.65;
      overflow-x: hidden;
      min-height: 100vh;
    }

    /* ─── Particle Canvas ─── */
    #particle-canvas {
      position: fixed;
      top: 0; left: 0;
      width: 100vw; height: 100vh;
      z-index: 0;
      pointer-events: none;
    }

    /* ─── Ambient Glow Orbs ─── */
    .ambient-orb {
      position: fixed;
      border-radius: 50%;
      filter: blur(120px);
      opacity: 0.12;
      pointer-events: none;
      z-index: 0;
    }
    .orb-gold { width: 500px; height: 500px; background: var(--bs-gold); top: -10%; right: -5%; animation: orbFloat 25s ease-in-out infinite; }
    .orb-teal { width: 400px; height: 400px; background: var(--bs-teal); bottom: 10%; left: -8%; animation: orbFloat 30s ease-in-out infinite reverse; }
    .orb-medical { width: 350px; height: 350px; background: var(--bs-medical); top: 50%; right: 30%; animation: orbFloat 20s ease-in-out infinite 5s; }

    @keyframes orbFloat {
      0%, 100% { transform: translate(0, 0) scale(1); }
      25% { transform: translate(30px, -40px) scale(1.1); }
      50% { transform: translate(-20px, 20px) scale(0.95); }
      75% { transform: translate(15px, 30px) scale(1.05); }
    }

    /* ─── Layout ─── */
    .page-wrapper {
      position: relative;
      z-index: 1;
      min-height: 100vh;
    }

    .container {
      max-width: 1280px;
      margin: 0 auto;
      padding: 0 24px;
    }

    .container-wide {
      max-width: 1440px;
      margin: 0 auto;
      padding: 0 24px;
    }

    /* ─── Top Bar ─── */
    .top-bar {
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(20px) saturate(1.4);
      -webkit-backdrop-filter: blur(20px) saturate(1.4);
      background: rgba(5,8,16,0.75);
      border-bottom: 1px solid var(--bs-border);
      padding: 0 24px;
    }
    .top-bar-inner {
      max-width: 1440px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 56px;
    }
    .top-bar-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: var(--bs-text);
    }
    .brand-mark {
      width: 32px; height: 32px;
      background: linear-gradient(135deg, var(--bs-gold), var(--bs-teal));
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--bs-font-display);
      font-weight: 800;
      font-size: 16px;
      color: var(--bs-void);
    }
    .brand-text {
      font-family: var(--bs-font-display);
      font-weight: 700;
      font-size: 15px;
      letter-spacing: 0.5px;
    }
    .brand-dot {
      color: var(--bs-gold);
      font-size: 11px;
      margin-left: 6px;
      opacity: 0.7;
    }
    .top-bar-nav {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .top-bar-nav a {
      color: var(--bs-text-dim);
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      padding: 6px 12px;
      border-radius: var(--bs-radius-xs);
      transition: all 0.2s;
      font-family: var(--bs-font-display);
      letter-spacing: 0.3px;
    }
    .top-bar-nav a:hover { color: var(--bs-gold-bright); background: rgba(212,165,116,0.06); }
    .top-bar-nav a.active { color: var(--bs-gold); background: rgba(212,165,116,0.1); }

    @media (max-width: 768px) {
      .top-bar-nav { display: none; }
    }

    /* ─── Hero ─── */
    .hero {
      padding: 100px 0 60px;
      position: relative;
    }
    .hero-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 16px;
      background: rgba(212,165,116,0.08);
      border: 1px solid rgba(212,165,116,0.15);
      border-radius: 100px;
      font-size: 12px;
      font-weight: 600;
      color: var(--bs-gold);
      font-family: var(--bs-font-display);
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 28px;
      animation: fadeSlideUp 0.6s ease-out;
    }
    .hero-badge .pulse-dot {
      width: 6px; height: 6px;
      background: var(--bs-emerald);
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    .hero h1 {
      font-family: var(--bs-font-display);
      font-size: clamp(36px, 5vw, 64px);
      font-weight: 800;
      line-height: 1.1;
      letter-spacing: -1px;
      margin-bottom: 24px;
      animation: fadeSlideUp 0.6s ease-out 0.1s both;
    }
    .hero h1 .gold { color: var(--bs-gold); }
    .hero h1 .teal { color: var(--bs-teal); }
    .hero-sub {
      font-size: 17px;
      color: var(--bs-text-dim);
      max-width: 680px;
      line-height: 1.75;
      margin-bottom: 40px;
      animation: fadeSlideUp 0.6s ease-out 0.2s both;
    }
    .hero-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      animation: fadeSlideUp 0.6s ease-out 0.3s both;
    }

    /* ─── Buttons ─── */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      border-radius: var(--bs-radius-sm);
      font-family: var(--bs-font-display);
      font-weight: 600;
      font-size: 14px;
      text-decoration: none;
      transition: all 0.3s;
      cursor: pointer;
      border: none;
      letter-spacing: 0.3px;
    }
    .btn-gold {
      background: linear-gradient(135deg, var(--bs-gold), #c4955a);
      color: var(--bs-void);
      box-shadow: 0 4px 20px rgba(212,165,116,0.25);
    }
    .btn-gold:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 30px rgba(212,165,116,0.35);
    }
    .btn-outline {
      background: transparent;
      color: var(--bs-text-dim);
      border: 1px solid var(--bs-border);
    }
    .btn-outline:hover {
      color: var(--bs-gold-bright);
      border-color: rgba(212,165,116,0.3);
      background: rgba(212,165,116,0.04);
    }
    .btn-teal {
      background: linear-gradient(135deg, var(--bs-teal), #0284c7);
      color: white;
      box-shadow: 0 4px 20px rgba(14,165,233,0.2);
    }
    .btn-teal:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 30px rgba(14,165,233,0.3);
    }

    /* ─── Section Headers ─── */
    .section {
      padding: 80px 0;
    }
    .section-label {
      font-family: var(--bs-font-display);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--bs-gold);
      margin-bottom: 12px;
      opacity: 0.8;
    }
    .section-title {
      font-family: var(--bs-font-display);
      font-size: clamp(24px, 3vw, 36px);
      font-weight: 700;
      line-height: 1.2;
      margin-bottom: 16px;
    }
    .section-desc {
      color: var(--bs-text-dim);
      max-width: 600px;
      font-size: 15px;
      line-height: 1.7;
      margin-bottom: 48px;
    }

    /* ─── Glass Cards ─── */
    .glass-card {
      background: var(--bs-glass);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--bs-border);
      border-radius: var(--bs-radius);
      padding: 28px;
      transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      overflow: hidden;
    }
    .glass-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(212,165,116,0.2), transparent);
      opacity: 0;
      transition: opacity 0.35s;
    }
    .glass-card:hover {
      border-color: var(--bs-border-glow);
      transform: translateY(-4px);
      box-shadow: var(--bs-shadow-glow);
    }
    .glass-card:hover::before { opacity: 1; }

    .glass-card-link {
      text-decoration: none;
      color: inherit;
      display: block;
    }

    /* ─── Interface Cards (4-lane grid) ─── */
    .lanes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
    }
    .lane-card {
      background: var(--bs-glass);
      backdrop-filter: blur(16px);
      border: 1px solid var(--bs-border);
      border-radius: var(--bs-radius);
      overflow: hidden;
      transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
    }
    .lane-card::after {
      content: '';
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 2px;
      background: var(--lane-accent, var(--bs-gold));
      opacity: 0;
      transition: opacity 0.3s;
    }
    .lane-card:hover { border-color: var(--bs-border-glow); transform: translateY(-4px); box-shadow: var(--bs-shadow-glow); }
    .lane-card:hover::after { opacity: 1; }

    .lane-header {
      padding: 24px 24px 0;
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .lane-icon {
      width: 44px; height: 44px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      flex-shrink: 0;
    }
    .lane-icon.patient { background: linear-gradient(135deg, rgba(212,165,116,0.15), rgba(212,165,116,0.05)); color: var(--bs-gold); }
    .lane-icon.provider { background: linear-gradient(135deg, rgba(14,165,233,0.15), rgba(14,165,233,0.05)); color: var(--bs-teal); }
    .lane-icon.payer { background: linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05)); color: var(--bs-emerald); }
    .lane-icon.government { background: linear-gradient(135deg, rgba(43,108,184,0.15), rgba(43,108,184,0.05)); color: var(--bs-medical); }
    .lane-icon.service { background: linear-gradient(135deg, rgba(148,163,184,0.1), rgba(148,163,184,0.03)); color: var(--bs-text-dim); }

    .lane-tag {
      font-family: var(--bs-font-display);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--bs-text-muted);
    }
    .lane-body {
      padding: 16px 24px 24px;
    }
    .lane-title {
      font-family: var(--bs-font-display);
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 8px;
      color: var(--bs-text);
    }
    .lane-desc {
      font-size: 13.5px;
      color: var(--bs-text-dim);
      line-height: 1.65;
      margin-bottom: 16px;
    }
    .lane-features {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 20px;
    }
    .lane-feature {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12.5px;
      color: var(--bs-text-muted);
    }
    .lane-feature .dot {
      width: 4px; height: 4px;
      border-radius: 50%;
      background: var(--bs-gold);
      opacity: 0.5;
      flex-shrink: 0;
    }
    .lane-route {
      font-family: var(--bs-font-mono);
      font-size: 11.5px;
      color: var(--bs-text-muted);
      padding: 6px 10px;
      background: rgba(255,255,255,0.03);
      border-radius: var(--bs-radius-xs);
      display: inline-block;
    }
    .lane-cta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 24px;
      border-top: 1px solid var(--bs-border);
      font-family: var(--bs-font-display);
      font-size: 13px;
      font-weight: 600;
      color: var(--bs-gold);
      text-decoration: none;
      transition: all 0.2s;
    }
    .lane-cta:hover { background: rgba(212,165,116,0.04); }
    .lane-cta .arrow { transition: transform 0.2s; }
    .lane-cta:hover .arrow { transform: translateX(4px); }

    /* ─── Metric Tiles ─── */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 48px;
    }
    .metric-tile {
      background: var(--bs-glass);
      backdrop-filter: blur(12px);
      border: 1px solid var(--bs-border);
      border-radius: var(--bs-radius-sm);
      padding: 20px;
      position: relative;
      overflow: hidden;
    }
    .metric-tile::before {
      content: '';
      position: absolute;
      top: 0; left: 0;
      width: 3px; height: 100%;
      background: var(--metric-color, var(--bs-gold));
      border-radius: 0 2px 2px 0;
    }
    .metric-label {
      font-family: var(--bs-font-display);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: var(--bs-text-muted);
      margin-bottom: 8px;
    }
    .metric-value {
      font-family: var(--bs-font-display);
      font-size: 28px;
      font-weight: 800;
      color: var(--bs-text);
      line-height: 1;
      margin-bottom: 4px;
    }
    .metric-sub {
      font-size: 12px;
      color: var(--bs-text-muted);
    }
    .metric-pulse {
      position: absolute;
      top: 16px; right: 16px;
      width: 8px; height: 8px;
      border-radius: 50%;
      animation: pulse 2.5s infinite;
    }
    .pulse-ok { background: var(--bs-emerald); box-shadow: 0 0 8px rgba(16,185,129,0.4); }
    .pulse-warn { background: var(--bs-amber); box-shadow: 0 0 8px rgba(245,158,11,0.4); }
    .pulse-crit { background: var(--bs-rose); box-shadow: 0 0 8px rgba(244,63,94,0.4); }

    /* ─── Stack Layers ─── */
    .stack-layers {
      display: flex;
      flex-direction: column;
      gap: 1px;
      background: var(--bs-border);
      border-radius: var(--bs-radius);
      overflow: hidden;
      margin-top: 48px;
    }
    .stack-layer {
      background: var(--bs-glass);
      padding: 28px 32px;
      display: flex;
      align-items: flex-start;
      gap: 24px;
      transition: background 0.2s;
    }
    .stack-layer:hover { background: var(--bs-glass-hover); }
    .stack-num {
      font-family: var(--bs-font-display);
      font-size: 11px;
      font-weight: 800;
      color: var(--bs-gold);
      background: rgba(212,165,116,0.1);
      padding: 4px 10px;
      border-radius: var(--bs-radius-xs);
      flex-shrink: 0;
      letter-spacing: 0.5px;
    }
    .stack-content h4 {
      font-family: var(--bs-font-display);
      font-weight: 700;
      font-size: 16px;
      margin-bottom: 4px;
    }
    .stack-content p {
      color: var(--bs-text-dim);
      font-size: 13.5px;
    }

    /* ─── Footer ─── */
    .footer {
      border-top: 1px solid var(--bs-border);
      padding: 32px 24px;
      text-align: center;
      font-size: 12px;
      color: var(--bs-text-muted);
    }
    .footer-links {
      display: flex;
      justify-content: center;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    .footer-links a {
      color: var(--bs-text-dim);
      text-decoration: none;
      font-size: 12px;
      transition: color 0.2s;
    }
    .footer-links a:hover { color: var(--bs-gold); }

    /* ─── Animations ─── */
    @keyframes fadeSlideUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.3); }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .stagger-1 { animation: fadeSlideUp 0.5s ease-out 0.05s both; }
    .stagger-2 { animation: fadeSlideUp 0.5s ease-out 0.1s both; }
    .stagger-3 { animation: fadeSlideUp 0.5s ease-out 0.15s both; }
    .stagger-4 { animation: fadeSlideUp 0.5s ease-out 0.2s both; }
    .stagger-5 { animation: fadeSlideUp 0.5s ease-out 0.25s both; }
    .stagger-6 { animation: fadeSlideUp 0.5s ease-out 0.3s both; }
    .stagger-7 { animation: fadeSlideUp 0.5s ease-out 0.35s both; }
    .stagger-8 { animation: fadeSlideUp 0.5s ease-out 0.4s both; }
    .stagger-9 { animation: fadeSlideUp 0.5s ease-out 0.45s both; }
    .stagger-10 { animation: fadeSlideUp 0.5s ease-out 0.5s both; }

    /* ─── Responsive ─── */
    @media (max-width: 768px) {
      .hero { padding: 60px 0 40px; }
      .hero h1 { font-size: 28px; }
      .lanes-grid { grid-template-columns: 1fr; }
      .metrics-grid { grid-template-columns: repeat(2, 1fr); }
      .stack-layer { flex-direction: column; gap: 12px; }
    }

    /* ─── Sub-page specific ─── */
    .sub-hero {
      padding: 80px 0 40px;
    }
    .sub-hero-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 5px 14px;
      border-radius: 100px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-bottom: 20px;
    }
    .sub-hero h1 {
      font-family: var(--bs-font-display);
      font-size: clamp(28px, 4vw, 48px);
      font-weight: 800;
      line-height: 1.15;
      margin-bottom: 16px;
    }
    .sub-hero-desc {
      font-size: 16px;
      color: var(--bs-text-dim);
      max-width: 560px;
      line-height: 1.7;
      margin-bottom: 32px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 12px;
      margin-bottom: 40px;
    }
    .info-chip {
      background: rgba(255,255,255,0.03);
      border: 1px solid var(--bs-border);
      border-radius: var(--bs-radius-xs);
      padding: 12px 16px;
    }
    .info-chip-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: var(--bs-text-muted);
      margin-bottom: 4px;
    }
    .info-chip-value {
      font-family: var(--bs-font-display);
      font-size: 13px;
      font-weight: 600;
      color: var(--bs-text);
    }
    .features-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .feature-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 18px;
      background: rgba(255,255,255,0.02);
      border: 1px solid var(--bs-border);
      border-radius: var(--bs-radius-sm);
      transition: all 0.2s;
    }
    .feature-item:hover { border-color: var(--bs-border-glow); background: rgba(212,165,116,0.02); }
    .feature-bullet {
      width: 20px; height: 20px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-size: 10px;
      margin-top: 1px;
    }
    .feature-text {
      font-size: 14px;
      color: var(--bs-text-dim);
      line-height: 1.5;
    }

    /* ─── Status Page Specific ─── */
    .status-banner {
      padding: 10px 20px;
      border-radius: var(--bs-radius-sm);
      font-size: 13px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 32px;
    }
    .status-ok { background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.2); color: var(--bs-emerald); }
    .status-degraded { background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.2); color: var(--bs-amber); }
    .status-down { background: rgba(244,63,94,0.1); border: 1px solid rgba(244,63,94,0.2); color: var(--bs-rose); }

    .infra-counters {
      display: flex;
      gap: 32px;
      flex-wrap: wrap;
      padding: 24px 0;
      border-top: 1px solid var(--bs-border);
      border-bottom: 1px solid var(--bs-border);
      margin: 40px 0;
    }
    .infra-counter {
      text-align: center;
    }
    .infra-num {
      font-family: var(--bs-font-display);
      font-size: 32px;
      font-weight: 800;
      color: var(--bs-gold);
    }
    .infra-label {
      font-size: 12px;
      color: var(--bs-text-muted);
    }

    /* Agent Strip */
    .agent-strip {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      padding: 20px 0;
    }
    .agent-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      background: rgba(255,255,255,0.03);
      border: 1px solid var(--bs-border);
      border-radius: 100px;
      font-family: var(--bs-font-mono);
      font-size: 11px;
      color: var(--bs-text-dim);
      transition: all 0.2s;
    }
    .agent-chip:hover {
      border-color: var(--bs-border-glow);
      color: var(--bs-gold);
    }
    .agent-chip .chip-dot {
      width: 5px; height: 5px;
      border-radius: 50%;
      background: var(--bs-teal);
    }

    /* ─── Divider ─── */
    .section-divider {
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--bs-border), transparent);
      margin: 0 auto;
      max-width: 800px;
    }
  `;
}

function getParticleScript() {
  return `
  (function() {
    const canvas = document.getElementById('particle-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w, h, particles = [], mouse = { x: -1000, y: -1000 };

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });

    class Particle {
      constructor() { this.reset(); }
      reset() {
        this.x = Math.random() * w;
        this.y = Math.random() * h;
        this.vx = (Math.random() - 0.5) * 0.3;
        this.vy = (Math.random() - 0.5) * 0.3;
        this.r = Math.random() * 1.5 + 0.3;
        this.alpha = Math.random() * 0.3 + 0.05;
      }
      update() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < 0 || this.x > w) this.vx *= -1;
        if (this.y < 0 || this.y > h) this.vy *= -1;
        const dx = mouse.x - this.x, dy = mouse.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          this.x -= dx * 0.005;
          this.y -= dy * 0.005;
        }
      }
      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(212,165,116,' + this.alpha + ')';
        ctx.fill();
      }
    }

    for (let i = 0; i < 80; i++) particles.push(new Particle());

    function drawLines() {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = 'rgba(14,165,233,' + (0.06 * (1 - dist / 120)) + ')';
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
    }

    function animate() {
      ctx.clearRect(0, 0, w, h);
      particles.forEach(p => { p.update(); p.draw(); });
      drawLines();
      requestAnimationFrame(animate);
    }
    animate();
  })();
  `;
}

function htmlShell(title, bodyContent, activeNav) {
  const navLinks = [
    { href: '/patient', label: 'BSMA', key: 'patient' },
    { href: '/givc', label: 'GIVC', key: 'givc' },
    { href: '/sbs', label: 'SBS', key: 'sbs' },
    { href: '/government', label: 'Gov', key: 'government' },
    { href: '/api', label: 'API', key: 'api' },
    { href: '/mcp', label: 'MCP', key: 'mcp' },
    { href: '/status', label: 'Status', key: 'status' },
  ];
  const navHtml = navLinks.map(l =>
    `<a href="${l.href}"${activeNav === l.key ? ' class="active"' : ''}>${escapeHtmlText(l.label)}</a>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtmlText(title)}</title>
  <meta name="description" content="BrainSAIT eCarePlus — Saudi Arabia's AI-native healthcare platform aligned with Vision 2030">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%231a365d'/><text x='16' y='22' text-anchor='middle' fill='%23d4a574' font-size='18' font-weight='bold' font-family='system-ui'>B</text></svg>">
  <style>${getDesignSystem()}</style>
</head>
<body>
  <canvas id="particle-canvas"></canvas>
  <div class="ambient-orb orb-gold"></div>
  <div class="ambient-orb orb-teal"></div>
  <div class="ambient-orb orb-medical"></div>

  <div class="page-wrapper">
    <header class="top-bar">
      <div class="top-bar-inner">
        <a href="/" class="top-bar-brand">
          <div class="brand-mark">B</div>
          <span class="brand-text">BrainSAIT<span class="brand-dot">eCarePlus</span></span>
        </a>
        <nav class="top-bar-nav">${navHtml}</nav>
      </div>
    </header>
    ${bodyContent}
    <footer class="footer">
      <div class="footer-links">
        <a href="/patient">BSMA</a>
        <a href="/givc">GIVC</a>
        <a href="/sbs">SBS</a>
        <a href="/government">Government</a>
        <a href="/api">API</a>
        <a href="/status">Status</a>
        <a href="/oasis">Oasis+</a>
        <a href="/oracle">Oracle</a>
        <a href="/simulation">Simulation</a>
        <a href="/control-tower">Control Tower</a>
      </div>
      <div>OID: 1.3.6.1.4.1.61026 · brainsait.org · ${new Date().toISOString().slice(0, 10)}</div>
    </footer>
  </div>
  <script>${getParticleScript()}</script>
</body>
</html>`;
}

function getStaggerClass(index) {
  return `stagger-${(index % 7) + 1}`;
}

function getServiceTheme(service) {
  const themeMap = {
    "/patient": { lane: "patient", icon: "🙂", accent: "var(--bs-gold)", bg: "rgba(212,165,116,0.08)", border: "rgba(212,165,116,0.15)" },
    "/givc": { lane: "provider", icon: "⚕️", accent: "var(--bs-teal)", bg: "rgba(14,165,233,0.08)", border: "rgba(14,165,233,0.15)" },
    "/sbs": { lane: "payer", icon: "💳", accent: "var(--bs-emerald)", bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.15)" },
    "/government": { lane: "government", icon: "🏛️", accent: "var(--bs-medical)", bg: "rgba(43,108,184,0.08)", border: "rgba(43,108,184,0.15)" },
    "/api": { lane: "service", icon: "🔗", accent: "var(--bs-gold)", bg: "rgba(212,165,116,0.08)", border: "rgba(212,165,116,0.15)" },
    "/mcp": { lane: "service", icon: "🤖", accent: "var(--bs-teal)", bg: "rgba(14,165,233,0.08)", border: "rgba(14,165,233,0.15)" },
    "/oasis": { lane: "service", icon: "🏢", accent: "var(--bs-medical)", bg: "rgba(43,108,184,0.08)", border: "rgba(43,108,184,0.15)" },
    "/oracle": { lane: "service", icon: "🧬", accent: "var(--bs-gold)", bg: "rgba(212,165,116,0.08)", border: "rgba(212,165,116,0.15)" },
    "/simulation": { lane: "service", icon: "🏥", accent: "var(--bs-gold)", bg: "rgba(212,165,116,0.08)", border: "rgba(212,165,116,0.15)" },
    "/status": { lane: "service", icon: "📊", accent: "var(--bs-emerald)", bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.15)" },
    "/docs": { lane: "service", icon: "📚", accent: "var(--bs-text-dim)", bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.15)" },
    "/admin": { lane: "service", icon: "🛡️", accent: "var(--bs-rose)", bg: "rgba(244,63,94,0.08)", border: "rgba(244,63,94,0.15)" },
  };

  return themeMap[service.path] || { lane: "service", icon: "📡", accent: "var(--bs-gold)", bg: "rgba(212,165,116,0.08)", border: "rgba(212,165,116,0.15)" };
}

function getServiceLaunchHref(service) {
  if (service.launchHref) return service.launchHref;
  if (!service.host) return null;
  return service.host.startsWith("http") ? service.host : `https://${service.host}`;
}

function formatServiceRoutes(service) {
  return [service.path, ...(service.aliases || [])].join(" · ");
}

function formatTimestampUtc(value) {
  return String(value || new Date().toISOString()).replace("T", " ").slice(0, 19);
}

function hostLabel(value) {
  if (!value) return "brainsait.org";
  try {
    return new URL(value).host;
  } catch {
    return String(value).replace(/^https?:\/\//, "");
  }
}

function renderMetricTile(metric, index) {
  return `
    <div class="metric-tile ${getStaggerClass(index)}" style="--metric-color: ${metric.color};">
      ${metric.pulse ? `<div class="metric-pulse ${metric.pulse}"></div>` : ""}
      <div class="metric-label">${escapeHtmlText(metric.label)}</div>
      <div class="metric-value">${escapeHtmlText(metric.value)}</div>
      <div class="metric-sub">${escapeHtmlText(metric.detail)}</div>
    </div>
  `;
}

function renderAgentStrip() {
  return MCP_AGENT_NETWORK.map((agent) => `<span class="agent-chip"><span class="chip-dot"></span>${escapeHtmlText(agent)}</span>`).join("");
}

function toneStyles(tone) {
  if (tone === "critical") {
    return { accent: "var(--bs-rose)", background: "rgba(244,63,94,0.1)" };
  }
  if (tone === "watch") {
    return { accent: "var(--bs-amber)", background: "rgba(245,158,11,0.1)" };
  }
  return { accent: "var(--bs-emerald)", background: "rgba(16,185,129,0.1)" };
}

function renderStatusRow(title, meta, signal, tone, index) {
  const styles = toneStyles(tone);
  return `
    <div class="feature-item ${getStaggerClass(index)}">
      <div class="feature-bullet" style="background:${styles.background};color:${styles.accent};">●</div>
      <div>
        <span class="feature-text" style="font-weight:600;color:var(--bs-text);">${escapeHtmlText(title)}</span>
        <span style="display:block;font-size:12px;color:var(--bs-text-muted);margin-top:4px;">${escapeHtmlText(meta)}</span>
        <span style="display:block;font-size:12px;color:var(--bs-text-muted);margin-top:3px;">${escapeHtmlText(signal)}</span>
      </div>
    </div>
  `;
}

function renderLaneCard(type, icon, tag, title, desc, features, href, routes, stagger) {
  return `
    <div class="lane-card ${stagger}" style="--lane-accent: ${type === 'patient' ? 'var(--bs-gold)' : type === 'provider' ? 'var(--bs-teal)' : type === 'payer' ? 'var(--bs-emerald)' : 'var(--bs-medical)'}">
      <div class="lane-header">
        <div class="lane-icon ${type}">${icon}</div>
        <span class="lane-tag">${escapeHtmlText(tag)}</span>
      </div>
      <div class="lane-body">
        <h3 class="lane-title">${escapeHtmlText(title)}</h3>
        <p class="lane-desc">${escapeHtmlText(desc)}</p>
        <div class="lane-features">
          ${features.map(f => `<div class="lane-feature"><span class="dot"></span>${escapeHtmlText(f)}</div>`).join('')}
        </div>
        <span class="lane-route">${escapeHtmlText(routes)}</span>
      </div>
      <a href="${href}" class="lane-cta">
        <span>Open interface</span>
        <span class="arrow">→</span>
      </a>
    </div>
  `;
}

function renderServiceCard(icon, title, desc, href, stagger) {
  return `
    <a href="${href}" class="glass-card-link ${stagger}">
      <div class="glass-card" style="padding: 22px;">
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
          <div class="lane-icon service">${icon}</div>
          <h4 style="font-family:var(--bs-font-display);font-size:15px;font-weight:700;">${escapeHtmlText(title)}</h4>
        </div>
        <p style="font-size:13px;color:var(--bs-text-dim);line-height:1.6;margin-bottom:12px;">${escapeHtmlText(desc)}</p>
        <span class="lane-route">${escapeHtmlText(href)}</span>
      </div>
    </a>
  `;
}

function renderLandingPage(snapshot) {
  const summary = snapshot.summary || {};
  const hosp = summary.hospitals || {};
  const ext = summary.externalServices || {};
  const claims = summary.claims || {};
  const apps = summary.platformApps || {};
  const actions = summary.actions || {};
  const overall = summary.overall || {};
  const infra = buildInfrastructureSnapshot(snapshot);

  const hospOnline = hosp.online || 0;
  const hospTotal = hosp.total || BRANCHES.length;
  const hospPct = hospTotal > 0 ? Math.round((hospOnline / hospTotal) * 100) : 0;
  const extReachable = ext.online || 0;
  const extTotal = ext.total || MOH_PORTALS.length;
  const extAvgMs = ext.avgLatencyMs || 0;
  const claimsReady = claims.readyClaims || 0;
  const claimsBlocked = claims.blockedClaims || 0;
  const appsLive = apps.live || 0;
  const appsTotal = apps.total || 0;
  const appsCritical = apps.critical || 0;
  const actionsActive = actions.total || 0;
  const actionsCrit = actions.critical || 0;
  const actionsHigh = actions.high || 0;
  const avgLat = overall.avgLatencyMs || 0;
  const latEndpoints = overall.monitoredEndpoints || 0;
  const primaryServices = EDGE_SERVICE_DIRECTORY.filter((service) => service.kind === "primary");
  const supportServices = EDGE_SERVICE_DIRECTORY.filter((service) => service.kind !== "primary");

  const hospPulse = hospPct >= 80 ? 'pulse-ok' : hospPct >= 50 ? 'pulse-warn' : 'pulse-crit';
  const extPulse = extReachable >= Math.max(1, extTotal - 1) ? 'pulse-ok' : extReachable >= 1 ? 'pulse-warn' : 'pulse-crit';

  const body = `
    <main>
      <section class="hero">
        <div class="container">
          <div class="hero-badge"><span class="pulse-dot"></span> eCarePlus · Saudi Vision 2030</div>
          <h1>Saudi Arabia's <span class="gold">smart portal edge</span><br>for <span class="teal">BOS</span>, BOT, Oracle, and MCP healthcare routing.</h1>
          <p class="hero-sub">
            BrainSAIT eCarePlus is the public gateway into patient, provider, payer, government, Oracle, and agentic healthcare systems.
            The live control-tower snapshot, hospital branch probes, Oracle portals, and scanner integrations stay intact while the landing layer upgrades to the v5 glassmorphic experience.
          </p>
          <div class="hero-actions">
            <a href="/patient" class="btn btn-gold">Open BSMA router</a>
            <a href="/status" class="btn btn-outline">Public status</a>
            <a href="/control-tower" class="btn btn-outline">Control Tower</a>
          </div>
          <div class="agent-strip" style="padding-top:20px;">
            <span class="agent-chip"><span class="chip-dot"></span>BOS orchestration</span>
            <span class="agent-chip"><span class="chip-dot"></span>BOT automation</span>
            <span class="agent-chip"><span class="chip-dot"></span>${escapeHtmlText(hostLabel('https://mcp.brainsait.org'))}</span>
            <span class="agent-chip"><span class="chip-dot"></span>Simulation ready</span>
          </div>
        </div>
      </section>

      <section class="section" style="padding-top: 20px;">
        <div class="container">
          <div class="section-label">Live Operational Pulse</div>
          <div class="metrics-grid">
            ${renderMetricTile({ label: 'Hospitals', value: `${hospOnline}/${hospTotal}`, detail: `${hospPct}% availability`, color: hospPct >= 80 ? 'var(--bs-emerald)' : hospPct >= 50 ? 'var(--bs-amber)' : 'var(--bs-rose)', pulse: hospPulse }, 0)}
            ${renderMetricTile({ label: 'External Services', value: `${extReachable}/${extTotal}`, detail: `Avg ${Math.round(extAvgMs)}ms latency`, color: 'var(--bs-teal)', pulse: extPulse }, 1)}
            ${renderMetricTile({ label: 'Claims Engine', value: String(claimsReady), detail: `${claimsBlocked} blocked claims`, color: 'var(--bs-gold)' }, 2)}
            ${renderMetricTile({ label: 'Platform Apps', value: `${appsLive}/${appsTotal}`, detail: appsCritical > 0 ? `${appsCritical} critical attention` : 'Normal', color: 'var(--bs-medical)' }, 3)}
            ${renderMetricTile({ label: 'Action Queue', value: String(actionsActive), detail: `${actionsCrit} critical · ${actionsHigh} high`, color: actionsCrit > 0 ? 'var(--bs-rose)' : 'var(--bs-emerald)' }, 4)}
            ${renderMetricTile({ label: 'Avg Latency', value: `${Math.round(avgLat)}ms`, detail: `${latEndpoints} monitored endpoints`, color: 'var(--bs-teal)' }, 5)}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container">
          <div class="section-label">Systems Router</div>
          <div class="section-title">One gateway, four healthcare lanes</div>
          <p class="section-desc">
            Each major lane retains a BrainSAIT-controlled router page on brainsait.org, then launches operators and users toward the correct live platform surface.
            Backend connections to branch Oracle portals and the control tower remain unchanged.
          </p>
          <div class="lanes-grid">
            ${primaryServices.map((service, index) => {
              const theme = getServiceTheme(service);
              return renderLaneCard(
                theme.lane,
                theme.icon,
                service.category,
                service.title,
                service.description,
                service.features || [],
                service.path,
                formatServiceRoutes(service),
                getStaggerClass(index),
              );
            }).join('')}
          </div>
        </div>
      </section>

      <div class="section-divider"></div>

      <section class="section">
        <div class="container">
          <div class="section-label">Connected Services</div>
          <div class="section-title">Infrastructure, agents, Oracle, and simulation</div>
          <p class="section-desc">
            Support services expose the wider BrainSAIT platform fabric: API and MCP gateways, Oracle Oasis, the Oracle bridge, the public status surface, docs, admin, and the agentic simulated hospital.
          </p>
          <div class="lanes-grid">
            ${supportServices.map((service, index) => {
              const theme = getServiceTheme(service);
              return renderServiceCard(theme.icon, service.title, service.description, service.path, getStaggerClass(index));
            }).join('')}
          </div>
        </div>
      </section>

      <section style="padding: 0 0 40px;">
        <div class="container">
          <div class="section-label" style="margin-bottom:16px;">LINC Agent Network</div>
          <div class="agent-strip">${renderAgentStrip()}</div>
        </div>
      </section>

      <div class="section-divider"></div>

      <section class="section">
        <div class="container">
          <div class="section-label">Infrastructure Reference</div>
          <div class="section-title">Cloudflare edge, BOS, BOT, and branch operations</div>
          <p class="section-desc">
            The portal now surfaces BOS orchestration, BOT automation, the MCP agent layer, Cloudflare Workers, D1, hospital branches, claims readiness, and the simulation environment alongside the live operational snapshot.
          </p>
          <div class="metrics-grid">
            ${renderMetricTile({ label: 'Workers', value: String(infra.inventory.workers), detail: 'Cloudflare Worker estate', color: 'var(--bs-gold)' }, 0)}
            ${renderMetricTile({ label: 'D1 Databases', value: String(infra.inventory.d1Databases), detail: 'Edge persistence layer', color: 'var(--bs-medical)' }, 1)}
            ${renderMetricTile({ label: 'Hospital Branches', value: String(infra.inventory.hospitalBranches), detail: 'Oracle-linked branches', color: 'var(--bs-emerald)' }, 2)}
            ${renderMetricTile({ label: 'Claims Ready', value: String(claimsReady), detail: 'Scanner-informed portfolio', color: 'var(--bs-gold)' }, 3)}
            ${renderMetricTile({ label: 'BOS', value: 'Active', detail: 'Operating System orchestration', color: 'var(--bs-teal)' }, 4)}
            ${renderMetricTile({ label: 'BOT', value: 'Active', detail: 'Operational Tools automation', color: 'var(--bs-teal)' }, 5)}
            ${renderMetricTile({ label: 'MCP Agents', value: String(MCP_AGENT_NETWORK.length), detail: 'Gateway via mcp.brainsait.org', color: 'var(--bs-medical)' }, 6)}
            ${renderMetricTile({ label: 'Simulation', value: 'Online', detail: hostLabel('https://simulation.brainsait.org'), color: 'var(--bs-gold)' }, 7)}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container">
          <div class="section-label">Architecture</div>
          <div class="section-title">How the platform stacks together</div>
          <p class="section-desc">
            Cloudflare edge routing feeds BOS orchestration, the MCP agent network, BOT automation, Oracle hospital gateways, and the simulated hospital training environment without changing the existing protected worker logic.
          </p>
          <div class="stack-layers">
            ${PORTAL_STACK_LAYERS.map((layer, index) => `
              <div class="stack-layer ${getStaggerClass(index)}">
                <span class="stack-num">${escapeHtmlText(layer.label)}</span>
                <div class="stack-content">
                  <h4>${escapeHtmlText(layer.title)}</h4>
                  <p>${escapeHtmlText(layer.detail)}</p>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </section>
    </main>
  `;

  return htmlShell('BrainSAIT eCarePlus', body, null);
}

function renderServiceEntryPage(service, snapshot) {
  const summary = snapshot.summary || {};
  const hosp = summary.hospitals || {};
  const claims = summary.claims || {};
  const actions = summary.actions || {};
  const apps = summary.platformApps || {};
  const theme = getServiceTheme(service);
  const routes = formatServiceRoutes(service);
  const launchHref = getServiceLaunchHref(service);
  const relatedServices = EDGE_SERVICE_DIRECTORY.filter((candidate) => candidate.path !== service.path).slice(0, 4);
  const activeNav = service.path === '/patient' ? 'patient' : service.slug;

  const body = `
    <main>
      <section class="sub-hero">
        <div class="container">
          <div class="sub-hero-badge" style="background:${theme.bg};border:1px solid ${theme.border};color:${theme.accent};">
            ${theme.icon} ${escapeHtmlText(service.category)}
          </div>
          <h1>${escapeHtmlText(service.title)}</h1>
          <p class="sub-hero-desc">${escapeHtmlText(service.description)}</p>

          <div class="info-grid">
            <div class="info-chip">
              <div class="info-chip-label">Audience</div>
              <div class="info-chip-value">${escapeHtmlText(service.audience)}</div>
            </div>
            <div class="info-chip">
              <div class="info-chip-label">Entry routes</div>
              <div class="info-chip-value" style="font-family:var(--bs-font-mono);font-size:12px;">${escapeHtmlText(routes)}</div>
            </div>
            <div class="info-chip">
              <div class="info-chip-label">Live destination</div>
              <div class="info-chip-value">${escapeHtmlText(hostLabel(launchHref || service.host || 'brainsait.org'))}</div>
            </div>
            <div class="info-chip">
              <div class="info-chip-label">Agent gateway</div>
              <div class="info-chip-value">${escapeHtmlText(hostLabel('https://mcp.brainsait.org'))}</div>
            </div>
          </div>

          <div class="hero-actions">
            ${launchHref ? `<a href="${escapeHtmlText(launchHref)}" target="_blank" rel="noopener noreferrer" class="btn btn-gold">${escapeHtmlText(service.launchLabel || `Open ${service.shortName}`)}</a>` : ''}
            <a href="/status" class="btn btn-outline">View public status</a>
            <a href="/control-tower" class="btn btn-outline">Open Control Tower</a>
            <a href="/" class="btn btn-outline">Back to brainsait.org</a>
          </div>
        </div>
      </section>

      <section class="section" style="padding-top:20px;">
        <div class="container">
          <div class="section-label">Service Highlights</div>
          <div class="section-title">What this interface delivers</div>
          <div class="features-list" style="max-width:720px; margin-top:24px;">
            ${(service.features || []).map((feature, index) => `
              <div class="feature-item ${getStaggerClass(index)}">
                <div class="feature-bullet" style="background:${theme.bg};color:${theme.accent};">✓</div>
                <span class="feature-text">${escapeHtmlText(feature)}</span>
              </div>
            `).join('')}
          </div>
          ${(service.relatedLinks || []).length ? `
            <div class="agent-strip" style="padding-top:18px;">
              ${service.relatedLinks.map((link) => `<a href="${escapeHtmlText(link.href)}" target="_blank" rel="noopener noreferrer" class="agent-chip"><span class="chip-dot"></span>${escapeHtmlText(link.label)}</a>`).join('')}
            </div>
          ` : ''}
        </div>
      </section>

      <section class="section" style="padding-top:0;">
        <div class="container">
          <div class="section-label">Operational Context</div>
          <div class="metrics-grid">
            ${renderMetricTile({ label: 'Hospitals', value: `${hosp.online || 0}/${hosp.total || 0}`, detail: `${formatPercent(hosp.availabilityPct)} availability`, color: (hosp.online || 0) === (hosp.total || 0) ? 'var(--bs-emerald)' : (hosp.online || 0) > 0 ? 'var(--bs-amber)' : 'var(--bs-rose)' }, 0)}
            ${renderMetricTile({ label: 'Claims Ready', value: String(claims.readyClaims || 0), detail: `${claims.blockedClaims || 0} blocked claims`, color: 'var(--bs-gold)' }, 1)}
            ${renderMetricTile({ label: 'Platform Apps', value: `${apps.live || 0}/${apps.total || 0}`, detail: `${apps.critical || 0} critical attention`, color: 'var(--bs-medical)' }, 2)}
            ${renderMetricTile({ label: 'Actions', value: String(actions.total || 0), detail: `${actions.critical || 0} critical · ${actions.high || 0} high`, color: (actions.critical || 0) > 0 ? 'var(--bs-rose)' : 'var(--bs-emerald)' }, 3)}
          </div>
        </div>
      </section>

      <section class="section" style="padding-top:0;">
        <div class="container">
          <div class="section-label">Connected Services</div>
          <div class="section-title">Part of the BrainSAIT fabric</div>
          <p class="section-desc">This route stays connected to the wider edge fabric: status, API, MCP, Oracle, and simulation services remain discoverable from the router page.</p>
          <div class="lanes-grid" style="grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));">
            ${relatedServices.map((candidate, index) => {
              const candidateTheme = getServiceTheme(candidate);
              return renderServiceCard(candidateTheme.icon, candidate.title, candidate.description, candidate.path, getStaggerClass(index));
            }).join('')}
          </div>
        </div>
      </section>

      <section style="padding: 0 0 60px;">
        <div class="container">
          <div class="section-label" style="margin-bottom:16px;">Active LINC Agents</div>
          <div class="agent-strip">${renderAgentStrip()}</div>
        </div>
      </section>
    </main>
  `;

  return htmlShell(`${service.title} · BrainSAIT`, body, activeNav);
}

function renderStatusPage(snapshot) {
  const ts = snapshot?.timestamp || new Date().toISOString();
  const summary = snapshot.summary || {};
  const hosp = summary.hospitals || {};
  const ext = summary.externalServices || {};
  const claims = summary.claims || {};
  const apps = summary.platformApps || {};
  const actions = summary.actions || {};
  const overall = summary.overall || {};
  const infra = buildInfrastructureSnapshot(snapshot);
  const platformStatus = derivePlatformStatus(summary);

  const hospOnline = hosp.online || 0;
  const hospTotal = hosp.total || BRANCHES.length;
  const hospPct = hospTotal > 0 ? Math.round((hospOnline / hospTotal) * 100) : 0;
  const extReachable = ext.online || 0;
  const extTotal = ext.total || MOH_PORTALS.length;
  const extAvgMs = ext.avgLatencyMs || 0;
  const claimsReady = claims.readyClaims || 0;
  const claimsBlocked = claims.blockedClaims || 0;
  const appsLive = apps.live || 0;
  const appsTotal = apps.total || 0;
  const appsCritical = apps.critical || 0;
  const actionsActive = actions.total || 0;
  const actionsCrit = actions.critical || 0;
  const actionsHigh = actions.high || 0;
  const avgLat = overall.avgLatencyMs || 0;
  const latEndpoints = overall.monitoredEndpoints || 0;

  const bannerClass = platformStatus === 'operational' ? 'status-ok' : platformStatus === 'degraded' ? 'status-degraded' : 'status-down';
  const bannerText = platformStatus === 'operational'
    ? 'All public platform surfaces are operational.'
    : platformStatus === 'degraded'
      ? 'Partial degradation detected across monitored services.'
      : 'Significant public service issues detected.';
  const bannerIcon = platformStatus === 'operational' ? '●' : platformStatus === 'degraded' ? '▲' : '▼';

  const body = `
    <main>
      <section class="sub-hero">
        <div class="container">
          <a href="/" style="color:var(--bs-text-dim);text-decoration:none;font-size:13px;display:inline-flex;align-items:center;gap:6px;margin-bottom:20px;">← Back to brainsait.org</a>
          <div class="section-label">Public Operations</div>
          <h1>BrainSAIT <span style="color:var(--bs-gold);">Platform Status</span></h1>
          <p class="sub-hero-desc">
            This public operations view reflects the same live control-tower snapshot used by the operator dashboard,
            summarized for safe external visibility across hospitals, external exchanges, claims readiness, and platform actions.
          </p>
          <div class="status-banner ${bannerClass}">${bannerIcon} ${escapeHtmlText(bannerText)}</div>
          <div style="font-size:12px;color:var(--bs-text-muted);margin-top:12px;">Updated ${escapeHtmlText(formatTimestampUtc(ts))} UTC</div>
        </div>
      </section>

      <section class="section" style="padding-top:20px;">
        <div class="container">
          <div class="metrics-grid">
            ${renderMetricTile({ label: 'Hospitals Online', value: `${hospOnline}/${hospTotal}`, detail: `${hospPct}% availability`, color: hospPct >= 80 ? 'var(--bs-emerald)' : hospPct >= 50 ? 'var(--bs-amber)' : 'var(--bs-rose)', pulse: hospPct >= 80 ? 'pulse-ok' : hospPct >= 50 ? 'pulse-warn' : 'pulse-crit' }, 0)}
            ${renderMetricTile({ label: 'External Services', value: `${extReachable}/${extTotal}`, detail: `Avg ${Math.round(extAvgMs)}ms latency`, color: 'var(--bs-teal)', pulse: extReachable >= Math.max(1, extTotal - 1) ? 'pulse-ok' : extReachable >= 1 ? 'pulse-warn' : 'pulse-crit' }, 1)}
            ${renderMetricTile({ label: 'Claims Ready', value: String(claimsReady), detail: `${claimsBlocked} blocked claims`, color: 'var(--bs-gold)' }, 2)}
            ${renderMetricTile({ label: 'Platform Apps', value: `${appsLive}/${appsTotal}`, detail: appsCritical > 0 ? `${appsCritical} critical attention` : 'Normal', color: 'var(--bs-medical)' }, 3)}
            ${renderMetricTile({ label: 'Priority Actions', value: String(actionsActive), detail: `${actionsCrit} critical · ${actionsHigh} high`, color: actionsCrit > 0 ? 'var(--bs-rose)' : 'var(--bs-emerald)' }, 4)}
            ${renderMetricTile({ label: 'Avg Latency', value: `${Math.round(avgLat)}ms`, detail: `${latEndpoints} monitored endpoints`, color: 'var(--bs-teal)' }, 5)}
          </div>
        </div>
      </section>

      ${(snapshot.hospitals || []).length ? `
      <section class="section" style="padding-top:0;">
        <div class="container">
          <div class="section-label">Hospital Network</div>
          <div class="section-title">Branch connectivity</div>
          <div class="features-list" style="max-width:760px;margin-top:20px;">
            ${(snapshot.hospitals || []).map((hospital, index) => renderStatusRow(
              hospital.nameEn || hospital.name || hospital.id,
              `${hospital.region || 'Hospital'} · ${hospital.healthLabel || 'Unknown'} · ${formatLatency(hospital.latency)}`,
              hospital.signal || 'Awaiting next probe.',
              hospital.tone || (hospital.online ? 'stable' : 'critical'),
              index,
            )).join('')}
          </div>
        </div>
      </section>
      ` : ''}

      ${(snapshot.externalServices || []).length ? `
      <section class="section" style="padding-top:0;">
        <div class="container">
          <div class="section-label">External Services</div>
          <div class="section-title">MOH and NPHIES posture</div>
          <div class="features-list" style="max-width:760px;margin-top:20px;">
            ${(snapshot.externalServices || []).map((service, index) => renderStatusRow(
              service.nameEn || service.name || service.id,
              `${service.healthLabel || 'Unknown'} · ${formatLatency(service.latency)}`,
              service.signal || 'Awaiting next probe.',
              service.tone || (service.online ? 'stable' : 'critical'),
              index,
            )).join('')}
          </div>
        </div>
      </section>
      ` : ''}

      <section class="section">
        <div class="container">
          <div class="section-label">Infrastructure Reference</div>
          <div class="infra-counters">
            <div class="infra-counter ${getStaggerClass(0)}"><div class="infra-num">${escapeHtmlText(String(infra.inventory.workers))}</div><div class="infra-label">Cloudflare Workers</div></div>
            <div class="infra-counter ${getStaggerClass(1)}"><div class="infra-num">${escapeHtmlText(String(infra.inventory.d1Databases))}</div><div class="infra-label">D1 Databases</div></div>
            <div class="infra-counter ${getStaggerClass(2)}"><div class="infra-num">${escapeHtmlText(String(infra.inventory.kvNamespaces))}</div><div class="infra-label">KV Namespaces</div></div>
            <div class="infra-counter ${getStaggerClass(3)}"><div class="infra-num">${escapeHtmlText(String(infra.inventory.hospitalBranches))}</div><div class="infra-label">Hospital Branches</div></div>
            <div class="infra-counter ${getStaggerClass(4)}"><div class="infra-num">${escapeHtmlText(String(infra.inventory.agents))}</div><div class="infra-label">LINC Agents</div></div>
            <div class="infra-counter ${getStaggerClass(5)}"><div class="infra-num">BOS</div><div class="infra-label">Orchestration</div></div>
            <div class="infra-counter ${getStaggerClass(6)}"><div class="infra-num">BOT</div><div class="infra-label">Automation</div></div>
          </div>
        </div>
      </section>

      <section class="section" style="padding-top:0;">
        <div class="container">
          <div class="section-label">Quick Access</div>
          <div class="lanes-grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr));">
            ${EDGE_SERVICE_DIRECTORY.filter((service) => ['/patient', '/givc', '/sbs', '/mcp', '/simulation'].includes(service.path)).map((service, index) => {
              const theme = getServiceTheme(service);
              return renderServiceCard(theme.icon, service.title, service.description, service.path, getStaggerClass(index));
            }).join('')}
          </div>
        </div>
      </section>
    </main>
  `;

  return htmlShell('BrainSAIT Platform Status', body, 'status');
}

function renderDashboard(snapshot) {
  const renderedAt = new Date(snapshot.timestamp);
  const serializedSnapshot = serializeForInlineScript(snapshot);

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BrainSAIT Healthcare Control Tower</title>
<meta name="description" content="BrainSAIT live operational control tower — hospital network health, claims pipeline, and infrastructure posture for the Saudi healthcare estate.">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta property="og:title" content="BrainSAIT Healthcare Control Tower">
<meta property="og:description" content="Live hospital network health, claims operations, and infrastructure posture.">
<meta property="og:type" content="website">
<style>
  @import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Sora:wght@400;500;600;700;800&display=swap");

  *, *::before, *::after { box-sizing: border-box; }

  :root {
    --bg: #08141a;
    --panel: rgba(9, 27, 33, 0.82);
    --panel-strong: rgba(7, 20, 25, 0.96);
    --line: rgba(125, 169, 173, 0.18);
    --line-strong: rgba(125, 169, 173, 0.32);
    --text: #edf8f6;
    --muted: #96b4b0;
    --cyan: #4ed6c5;
    --teal: #1da88f;
    --lime: #8ddf6d;
    --amber: #f2b766;
    --coral: #ef7d64;
    --shadow: 0 24px 80px rgba(0, 0, 0, 0.34);
    --radius-xl: 30px;
    --radius-lg: 22px;
  }

  html { scroll-behavior: smooth; }

  body {
    margin: 0;
    min-height: 100vh;
    font-family: "Sora", sans-serif;
    color: var(--text);
    background:
      radial-gradient(circle at top left, rgba(78, 214, 197, 0.18), transparent 28%),
      radial-gradient(circle at 85% 10%, rgba(242, 183, 102, 0.12), transparent 24%),
      linear-gradient(180deg, #071116 0%, #09161c 40%, #071116 100%);
  }

  body::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    background-image:
      linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
    background-size: 56px 56px;
    mask-image: linear-gradient(180deg, rgba(0,0,0,0.65), transparent 92%);
  }

  a { color: inherit; }

  .page {
    width: min(1280px, calc(100% - 32px));
    margin: 0 auto;
    padding: 24px 0 64px;
    position: relative;
    z-index: 1;
  }

  .hero {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: var(--radius-xl);
    padding: 32px;
    background:
      linear-gradient(135deg, rgba(29, 168, 143, 0.16), rgba(8, 20, 26, 0.94) 46%),
      linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0));
    box-shadow: var(--shadow);
  }

  .hero::after {
    content: "";
    position: absolute;
    width: 320px;
    height: 320px;
    right: -80px;
    top: -90px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(78, 214, 197, 0.28), transparent 70%);
    filter: blur(8px);
  }

  .hero-grid,
  .detail-grid,
  .footer-grid {
    display: grid;
    gap: 24px;
  }

  .hero-grid {
    grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.95fr);
    position: relative;
    z-index: 1;
  }

  .eyebrow {
    margin: 0 0 12px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--cyan);
    font-size: 0.72rem;
  }

  h1 {
    margin: 0;
    font-size: clamp(2.4rem, 6vw, 4.8rem);
    line-height: 0.98;
    max-width: 10ch;
  }

  h2 {
    margin: 0;
    font-size: 1.18rem;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
  }

  .hero p,
  .section-shell p,
  .note-card p,
  .metric-panel p,
  .action-card p,
  .hospital-card p,
  .service-card p,
  .vision-panel p,
  .layer-card p,
  .flow-step p,
  .agent-card p,
  .security-card p,
  .playbook-card p,
  .data-card p {
    margin: 0;
    max-width: 64ch;
    color: var(--muted);
    font-size: 0.95rem;
    line-height: 1.7;
  }

  .stack,
  .hero-actions,
  .hero-notes,
  .stats-grid,
  .layer-grid,
  .hospital-grid,
  .service-grid,
  .platform-grid,
  .agent-grid,
  .playbook-grid,
  .data-grid,
  .flow-strip,
  .toolbar,
  .toolbar-meta,
  .action-list {
    display: grid;
    gap: 16px;
  }

  .stack {
    margin-top: 22px;
    gap: 22px;
  }

  .hero-actions {
    grid-template-columns: repeat(auto-fit, minmax(180px, max-content));
    margin-top: 26px;
  }

  .hero-actions a,
  .hero-actions button,
  .primary-link,
  .secondary-link,
  .disabled-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    border-radius: 999px;
    padding: 13px 18px;
    text-decoration: none;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
  }

  .hero-actions a:hover,
  .hero-actions button:hover,
  .primary-link:hover,
  .secondary-link:hover { transform: translateY(-1px); }

  .primary-action,
  .primary-link {
    background: linear-gradient(135deg, var(--cyan), var(--teal));
    color: #062029;
  }

  .secondary-action,
  .secondary-link {
    background: rgba(255,255,255,0.03);
    color: var(--text);
    border-color: var(--line-strong);
  }

  .secondary-action[disabled] {
    opacity: 0.65;
    cursor: wait;
  }

  .disabled-link {
    border: 1px dashed rgba(239, 125, 100, 0.4);
    background: rgba(239, 125, 100, 0.08);
    color: rgba(255, 255, 255, 0.72);
    cursor: not-allowed;
  }

  .hero-notes,
  .stats-grid,
  .toolbar-meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .note-card,
  .metric-panel,
  .layer-card,
  .section-shell,
  .hospital-card,
  .service-card,
  .agent-card,
  .security-card,
  .playbook-card,
  .data-card,
  .stat-card,
  .flow-step,
  .vision-panel,
  .action-card,
  .mini-stat {
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--panel);
    backdrop-filter: blur(16px);
  }

  .note-card,
  .metric-panel,
  .layer-card,
  .hospital-card,
  .service-card,
  .agent-card,
  .security-card,
  .playbook-card,
  .data-card,
  .stat-card,
  .flow-step,
  .vision-panel,
  .action-card,
  .mini-stat {
    padding: 20px;
  }

  .metric-panel {
    display: grid;
    gap: 14px;
    align-content: start;
    background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
  }

  .refresh-strip,
  .toolbar-status,
  .action-meta,
  .service-meta,
  .hospital-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    color: rgba(255,255,255,0.68);
    font-size: 0.8rem;
  }

  .refresh-error {
    color: var(--coral);
  }

  .stat-card strong,
  .mini-stat strong {
    display: block;
    font-size: 2.1rem;
    line-height: 1;
    margin-bottom: 8px;
  }

  .stat-card span,
  .mini-stat span {
    display: block;
    color: var(--muted);
    font-size: 0.84rem;
  }

  .stat-card small {
    display: block;
    margin-top: 14px;
    color: rgba(255,255,255,0.64);
    font-size: 0.75rem;
  }

  .section-shell {
    padding: 24px;
    background: var(--panel-strong);
  }

  .section-header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 18px;
  }

  .section-header p { max-width: 62ch; }

  .layer-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .integration-grid,
  .hospital-grid,
  .service-grid,
  .platform-grid,
  .claims-grid,
  .reason-grid,
  .agent-grid,
  .playbook-grid,
  .data-grid { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
  .flow-strip { grid-template-columns: repeat(5, minmax(0, 1fr)); }

  .layer-card span,
  .flow-step span,
  .severity-badge,
  .status-chip {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .layer-card span,
  .flow-step span {
    margin-bottom: 14px;
    color: var(--cyan);
  }

  .flow-step { position: relative; min-height: 170px; }

  .flow-step::after {
    content: "→";
    position: absolute;
    right: -11px;
    top: 50%;
    transform: translateY(-50%);
    color: rgba(255,255,255,0.22);
    font-size: 1.25rem;
  }

  .flow-step:last-child::after { display: none; }

  .hospital-card,
  .service-card,
  .action-card,
  .vision-panel { position: relative; overflow: hidden; }

  .hospital-card::before,
  .service-card::before,
  .action-card::before,
  .vision-panel::before {
    content: "";
    position: absolute;
    inset: 0 0 auto 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent);
    opacity: 0.22;
  }

  .hospital-card.tone-stable,
  .service-card.tone-stable,
  .action-card.severity-info { box-shadow: inset 0 0 0 1px rgba(78, 214, 197, 0.05); }

  .hospital-card.tone-watch,
  .service-card.tone-watch,
  .action-card.severity-medium,
  .action-card.severity-high { box-shadow: inset 0 0 0 1px rgba(242, 183, 102, 0.14); }

  .hospital-card.tone-critical,
  .service-card.tone-critical,
  .action-card.severity-critical { box-shadow: inset 0 0 0 1px rgba(239, 125, 100, 0.14); }

  .hospital-top,
  .service-top,
  .action-top {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 14px;
  }

  .arabic-name {
    margin-top: 6px;
    font-family: "IBM Plex Sans Arabic", sans-serif;
    color: rgba(237, 248, 246, 0.82);
    font-size: 0.9rem;
  }

  .status-chip,
  .severity-badge {
    padding: 7px 11px;
    border: 1px solid transparent;
    white-space: nowrap;
  }

  .status-chip.stable,
  .severity-badge.info {
    background: rgba(141, 223, 109, 0.12);
    color: var(--lime);
    border-color: rgba(141, 223, 109, 0.2);
  }

  .status-chip.watch,
  .severity-badge.medium,
  .severity-badge.high {
    background: rgba(242, 183, 102, 0.14);
    color: var(--amber);
    border-color: rgba(242, 183, 102, 0.2);
  }

  .status-chip.critical,
  .severity-badge.critical {
    background: rgba(239, 125, 100, 0.14);
    color: var(--coral);
    border-color: rgba(239, 125, 100, 0.2);
  }

  .owner-pill,
  .provider-pill {
    display: inline-flex;
    align-items: center;
    padding: 7px 11px;
    border-radius: 999px;
    background: rgba(255,255,255,0.04);
    color: rgba(255,255,255,0.74);
    font-size: 0.74rem;
  }

  .hospital-metrics,
  .service-metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin: 18px 0 16px;
  }

  .hospital-metrics div,
  .service-metrics div {
    padding: 12px;
    border-radius: 14px;
    background: rgba(255,255,255,0.035);
    border: 1px solid rgba(255,255,255,0.05);
  }

  .metric-label {
    display: block;
    color: rgba(255,255,255,0.58);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 8px;
  }

  .hospital-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 18px;
  }

  .hospital-tags span {
    border-radius: 999px;
    padding: 7px 10px;
    background: rgba(255,255,255,0.04);
    color: rgba(255,255,255,0.68);
    font-size: 0.74rem;
  }

  .toolbar {
    grid-template-columns: minmax(240px, 1.2fr) minmax(0, 1fr) minmax(220px, 0.8fr);
    align-items: end;
  }

  .search-box span {
    display: block;
    margin-bottom: 8px;
    color: rgba(255,255,255,0.68);
    font-size: 0.82rem;
  }

  .search-box input {
    width: 100%;
    border: 1px solid var(--line-strong);
    border-radius: 14px;
    background: rgba(255,255,255,0.03);
    color: var(--text);
    padding: 14px 16px;
    font: inherit;
  }

  .search-box input:focus {
    outline: none;
    border-color: rgba(78, 214, 197, 0.46);
    box-shadow: 0 0 0 3px rgba(78, 214, 197, 0.12);
  }

  .filter-group {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .filter-pill {
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    padding: 11px 14px;
    background: rgba(255,255,255,0.03);
    color: rgba(255,255,255,0.74);
    font: inherit;
    cursor: pointer;
  }

  .filter-pill.active {
    background: rgba(78, 214, 197, 0.14);
    color: var(--cyan);
    border-color: rgba(78, 214, 197, 0.28);
  }

  .mini-stat { padding: 16px 18px; }

  .action-list { grid-template-columns: 1fr; }

  .claims-grid,
  .reason-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
  }

  .action-recommendation {
    margin-top: 14px;
    padding: 14px;
    border-radius: 14px;
    background: rgba(255,255,255,0.035);
  }

  .action-links {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 16px;
  }

  .metric-note {
    margin-top: 12px;
    color: rgba(255,255,255,0.6);
    font-size: 0.8rem;
  }

  .reason-pill {
    display: inline-flex;
    align-items: center;
    margin-top: 12px;
    padding: 7px 11px;
    border-radius: 999px;
    background: rgba(255,255,255,0.04);
    color: rgba(255,255,255,0.74);
    font-size: 0.74rem;
  }

  .empty-state {
    padding: 24px;
    border: 1px dashed var(--line-strong);
    border-radius: 18px;
    color: rgba(255,255,255,0.62);
    text-align: center;
    background: rgba(255,255,255,0.02);
  }

  .vision-panel {
    padding: 24px;
    background:
      linear-gradient(135deg, rgba(78, 214, 197, 0.08), rgba(239, 125, 100, 0.06)),
      rgba(9, 27, 33, 0.82);
  }

  .footer-bar {
    margin-top: 24px;
    padding: 16px 18px;
    border-radius: 18px;
    border: 1px solid var(--line);
    background: rgba(255,255,255,0.03);
    color: rgba(255,255,255,0.68);
    font-size: 0.8rem;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 10px;
  }

  .fade-up {
    opacity: 0;
    transform: translateY(18px);
    animation: fadeUp 0.7s ease forwards;
  }

  .delay-1 { animation-delay: 0.08s; }
  .delay-2 { animation-delay: 0.16s; }
  .delay-3 { animation-delay: 0.24s; }
  .delay-4 { animation-delay: 0.32s; }

  .integration-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 8px;
  }

  .integration-status {
    min-height: 20px;
  }

  .integration-card {
    display: grid;
    gap: 10px;
  }

  .integration-card code {
    display: block;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: rgba(255,255,255,0.025);
    padding: 10px 12px;
    color: rgba(255,255,255,0.78);
    font-size: 0.75rem;
    overflow-wrap: anywhere;
  }

  @keyframes fadeUp {
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 1080px) {
    .hero-grid,
    .detail-grid,
    .footer-grid,
    .layer-grid,
    .flow-strip,
    .toolbar {
      grid-template-columns: 1fr;
    }

    .flow-step::after { display: none; }
  }

  @media (max-width: 720px) {
    .page { width: min(100% - 18px, 1280px); padding-top: 10px; }
    .hero,
    .section-shell,
    .vision-panel { padding: 18px; }
    .hero-notes,
    .stats-grid,
    .toolbar-meta,
    .hospital-metrics,
    .service-metrics { grid-template-columns: 1fr; }
    .section-header,
    .footer-bar {
      flex-direction: column;
      align-items: start;
    }
  }
</style>
</head>
<body>
  <main class="page">
    <section class="hero fade-up">
      <div class="hero-grid">
        <div>
          <p class="eyebrow">BrainSAIT Healthcare Control Tower</p>
          <h1>Operate hospitals, NPHIES, and infrastructure as one network.</h1>
          <p>
            This version turns the BrainSAIT Control Tower into a live command surface. Hospital probes, external healthcare services, and computed priority actions are now combined into one operational snapshot that can refresh continuously without reloading the page.
          </p>
          <p>
            Search, filter, and real action queue handling now sit beside the architectural roadmap, so the portal acts like an actual control tower instead of a static gateway page.
          </p>
          <div class="hero-actions">
            <a href="#network" class="primary-action">View live hospital network</a>
            <a href="/api/control-tower/summary" target="_blank" rel="noopener noreferrer" class="secondary-action">Open summary API</a>
            <button type="button" id="refreshNow" class="secondary-action">Refresh live data</button>
          </div>
          <div class="hero-notes">
            <div class="note-card fade-up delay-1">
              <p class="eyebrow">Operational gain</p>
              <p>External services are monitored, branches are filterable, and action priorities are computed from real endpoint state.</p>
            </div>
            <div class="note-card fade-up delay-2">
              <p class="eyebrow">Business telemetry live</p>
              <p>The claims command now prefers live scanner batch telemetry and live NPHIES endpoint state, while keeping the current appeal portfolio as an explicit fallback reference.</p>
            </div>
          </div>
        </div>
        <aside class="metric-panel fade-up delay-1">
          <p class="eyebrow">Live operations snapshot</p>
          <h2>Current network posture</h2>
          <div class="stats-grid">
            <div class="stat-card">
              <strong id="statAvailabilityPct">${snapshot.summary.hospitals.availabilityPct}%</strong>
              <span>Hospital portal availability</span>
              <small id="statAvailabilityMeta">${snapshot.summary.hospitals.online} online / ${snapshot.summary.hospitals.offline} offline</small>
            </div>
            <div class="stat-card">
              <strong id="statAvgLatency">${snapshot.summary.overall.avgLatencyMs ? `${snapshot.summary.overall.avgLatencyMs} ms` : "N/A"}</strong>
              <span>Average live latency</span>
              <small id="statLatencyMeta">${snapshot.summary.hospitals.degraded} degraded hospitals / ${snapshot.summary.externalServices.degraded} degraded external services</small>
            </div>
            <div class="stat-card">
              <strong id="statMonitored">${snapshot.summary.overall.operationalSurfaces}</strong>
              <span>Operational surfaces</span>
              <small id="statMonitoredMeta">${snapshot.summary.hospitals.total} hospitals + ${snapshot.summary.externalServices.total} external services + ${snapshot.summary.platformApps.total} platform apps</small>
            </div>
            <div class="stat-card">
              <strong id="statActionCount">${snapshot.summary.actions.total}</strong>
              <span>Priority actions open</span>
              <small id="statActionMeta">${snapshot.summary.actions.critical} critical / ${snapshot.summary.actions.high} high</small>
            </div>
          </div>
          <div class="refresh-strip">
            <span id="refreshState">Live snapshot ready</span>
            <span id="refreshCountdown">Next refresh in ${Math.round(snapshot.meta.refreshIntervalMs / 1000)}s</span>
            <span id="lastUpdated">Last probe: ${renderedAt.toUTCString()}</span>
            <span id="refreshError" class="refresh-error" hidden></span>
          </div>
        </aside>
      </div>
    </section>

    <section class="section-shell stack fade-up delay-1" id="integration-fabric">
      <div class="section-header">
        <div>
          <p class="eyebrow">Integration fabric</p>
          <h2>Repository, tunnel, portals, and scanner connectivity</h2>
        </div>
        <p>This command center keeps engineering alignment visible: source repository health, branch tunnel posture, portals control-plane state, and scanner feed mode.</p>
      </div>
      <div class="integration-grid" id="integrationGrid">
        <div class="empty-state">Loading integration connectivity cards...</div>
      </div>
      <div class="integration-actions">
        <a id="openRepoLink" href="${snapshot.integrations?.repo?.url || "https://github.com/Fadil369/oracle-setup"}" target="_blank" rel="noopener noreferrer" class="primary-action">Open repository</a>
        <button type="button" id="runIntegrationCheck" class="secondary-action">Run integration check</button>
        <button type="button" id="openTunnelRunbook" class="secondary-action">Open tunnel runbook</button>
        <button type="button" id="copyHealthCurl" class="secondary-action">Copy health curl</button>
      </div>
      <div class="toolbar-status integration-status" id="integrationStatus">Integration fabric ready.</div>
    </section>

    <section class="section-shell stack fade-up delay-1">
      <div class="section-header">
        <div>
          <p class="eyebrow">Architecture blueprint</p>
          <h2>The four layers of the BrainSAIT platform</h2>
        </div>
        <p>The UI is now live, but the roadmap remains visible so operators and stakeholders can connect each monitoring surface to the larger healthcare platform architecture.</p>
      </div>
      <div class="layer-grid">
        ${CONTROL_TOWER_LAYERS.map(layer => `
        <article class="layer-card fade-up delay-2">
          <span>${layer.label}</span>
          <h3>${layer.title}</h3>
          <p>${layer.detail}</p>
          <p>${layer.outcome}</p>
        </article>`).join("")}
      </div>
    </section>

    <section class="section-shell stack fade-up delay-2" id="network">
      <div class="section-header">
        <div>
          <p class="eyebrow">Hospital network</p>
          <h2>Live Oracle and branch connectivity</h2>
        </div>
        <p>Search hospitals, filter by operational state, and refresh in place. This grid is rendered from the control-tower snapshot rather than fixed HTML.</p>
      </div>
      <div class="toolbar">
        <label class="search-box">
          <span>Search hospitals</span>
          <input id="hospitalSearch" type="search" placeholder="Search by hospital, region, Arabic name, or subdomain">
        </label>
        <div class="filter-group" id="statusFilters">
          <button type="button" class="filter-pill active" data-filter="all">All</button>
          <button type="button" class="filter-pill" data-filter="stable">Operational</button>
          <button type="button" class="filter-pill" data-filter="watch">Watch</button>
          <button type="button" class="filter-pill" data-filter="critical">Critical</button>
        </div>
        <div class="toolbar-meta">
          <div class="mini-stat">
            <strong id="visibleHospitalCount">${snapshot.hospitals.length}</strong>
            <span>Visible branches</span>
          </div>
          <div class="mini-stat">
            <strong id="visibleActionCount">${snapshot.summary.actions.total}</strong>
            <span>Open actions</span>
          </div>
        </div>
      </div>
      <div class="toolbar-status" id="filterSummary">Showing all monitored hospital branches.</div>
      <div class="hospital-grid" id="hospitalGrid">
        <div class="empty-state">Loading live hospital cards...</div>
      </div>
    </section>

    <section class="detail-grid stack fade-up delay-2" id="claims-command">
      <section class="section-shell">
        <div class="section-header">
          <div>
            <p class="eyebrow">Claims command</p>
            <h2>Live claims, approvals, rejection, and payment recovery metrics</h2>
          </div>
          <p>The current appeal batch is now part of the control-tower snapshot, so operators can see business flow pressure and not just connectivity state.</p>
        </div>
        <div class="claims-grid" id="claimsSummaryGrid">
          <div class="empty-state">Loading claims metrics...</div>
        </div>
        <div class="reason-grid" id="rejectionReasonGrid" style="margin-top:16px;">
          <div class="empty-state">Loading rejection profile...</div>
        </div>
      </section>

      <section class="section-shell">
        <div class="section-header">
          <div>
            <p class="eyebrow">Recovery and scan health</p>
            <h2>Deadline risk, payment recovery, and scanner status</h2>
          </div>
          <p>Payment recovery is tracked by claim and service-item volume because the current batch files do not contain SAR amount fields.</p>
        </div>
        <div class="claims-grid" id="paymentSummaryGrid">
          <div class="empty-state">Loading payment recovery metrics...</div>
        </div>
        <div class="toolbar-status" id="scannerMeta">Loading scanner health...</div>
      </section>
    </section>

    <section class="section-shell stack fade-up delay-3" id="platform-apps">
      <div class="section-header">
        <div>
          <p class="eyebrow">Platform apps</p>
          <h2>Integrated services, pipelines, and operator workflows</h2>
        </div>
        <p>The rest of the platform is now surfaced explicitly. Live services stay live, embedded workflows are marked as derived readiness, and every app shows how it contributes to the operating model.</p>
      </div>
      <div class="claims-grid" id="platformSummaryGrid">
        <div class="empty-state">Loading platform app posture...</div>
      </div>
      <div class="toolbar-status" id="platformMeta">Loading platform app readiness...</div>
      <div class="platform-grid" id="platformAppsGrid">
        <div class="empty-state">Loading platform apps...</div>
      </div>
    </section>

    <section class="detail-grid stack fade-up delay-3">
      <section class="section-shell">
        <div class="section-header">
          <div>
            <p class="eyebrow">Action queue</p>
            <h2>Priority actions for offline or degraded services</h2>
          </div>
          <p>The queue is generated from real hospital and external endpoint state, with severity and ownership assigned automatically.</p>
        </div>
        <div class="toolbar-status" id="actionQueueMeta">Computing live action queue...</div>
        <div class="action-list" id="actionQueue">
          <div class="empty-state">Loading action queue...</div>
        </div>
      </section>

      <section class="section-shell">
        <div class="section-header">
          <div>
            <p class="eyebrow">Monitored services</p>
            <h2>External healthcare service health</h2>
          </div>
          <p>MOH and NPHIES links are now treated as monitored services, not just static shortcuts.</p>
        </div>
        <div class="toolbar-status" id="externalServiceMeta">Monitoring external healthcare services in real time.</div>
        <div class="service-grid" id="externalGrid">
          <div class="empty-state">Loading monitored services...</div>
        </div>
      </section>
    </section>

    <section class="section-shell stack fade-up delay-2">
      <div class="section-header">
        <div>
          <p class="eyebrow">Claims lane</p>
          <h2>NPHIES and insurance command flow</h2>
        </div>
        <p>This lane remains the operating sequence behind the live metrics above: branch data, adapter validation, NPHIES submission, payer decision, and payment return.</p>
      </div>
      <div class="flow-strip">
        ${CLAIMS_WORKFLOW.map((step, index) => `
        <article class="flow-step fade-up delay-${Math.min(index + 1, 4)}">
          <span>Step ${index + 1}</span>
          <h3>${step.title}</h3>
          <p>${step.detail}</p>
        </article>`).join("")}
      </div>
    </section>

    <section class="detail-grid stack">
      <section class="section-shell fade-up delay-3">
        <div class="section-header">
          <div>
            <p class="eyebrow">Agent mesh</p>
            <h2>AI agents that run the network</h2>
          </div>
        </div>
        <div class="agent-grid">
          ${AGENT_BLUEPRINT.map(agent => `
          <article class="agent-card">
            <h3>${agent.title}</h3>
            <p>${agent.mission}</p>
          </article>`).join("")}
        </div>
      </section>

      <section class="section-shell fade-up delay-3">
        <div class="section-header">
          <div>
            <p class="eyebrow">Security model</p>
            <h2>Guardrails for sensitive healthcare operations</h2>
          </div>
        </div>
        <div class="agent-grid">
          ${SECURITY_GUARDRAILS.map(item => `
          <article class="security-card">
            <h3>${item.title}</h3>
            <p>${item.detail}</p>
          </article>`).join("")}
        </div>
      </section>
    </section>

    <section class="detail-grid stack">
      <section class="section-shell fade-up delay-3">
        <div class="section-header">
          <div>
            <p class="eyebrow">Automation</p>
            <h2>n8n playbooks for operational response</h2>
          </div>
        </div>
        <div class="playbook-grid">
          ${AUTOMATION_PLAYBOOKS.map(playbook => `
          <article class="playbook-card">
            <h3>${playbook.title}</h3>
            <p>${playbook.detail}</p>
          </article>`).join("")}
        </div>
      </section>

      <section class="section-shell fade-up delay-3">
        <div class="section-header">
          <div>
            <p class="eyebrow">Data intelligence</p>
            <h2>The analytics layer that follows the integrations</h2>
          </div>
        </div>
        <div class="data-grid">
          ${DATA_PRODUCTS.map(product => `
          <article class="data-card">
            <h3>${product.title}</h3>
            <p>${product.detail}</p>
          </article>`).join("")}
        </div>
      </section>
    </section>

    <section class="footer-grid stack fade-up delay-4">
      <section class="vision-panel">
        <p class="eyebrow">Strategic outcome</p>
        <h3>From portal gateway to Saudi healthcare interoperability layer</h3>
        <p>
          With a live snapshot model in place, this page can now accept real claims telemetry, external payer status, FHIR adapter health, and agent-driven recommendations without changing its architectural role.
        </p>
        <p>
          That is the leverage point: one control tower for network health, claims operations, integrations, and executive insight.
        </p>
      </section>
    </section>

    <div class="footer-bar fade-up delay-4">
      <span>Live probe time: ${renderedAt.toUTCString()}</span>
      <span><a href="/api/branches" target="_blank" rel="noopener noreferrer">Branch config API</a> · <a href="/api/health" target="_blank" rel="noopener noreferrer">Health JSON</a> · <a href="/api/control-tower/summary" target="_blank" rel="noopener noreferrer">Summary JSON</a> · <a href="/api/control-tower/details" target="_blank" rel="noopener noreferrer">Details JSON</a></span>
      <span>BrainSAIT COMPLIANCELINC · brainsait.org/control-tower · ${renderedAt.toISOString().slice(0, 10)}</span>
    </div>
  </main>

  <script>
    const initialSnapshot = ${serializedSnapshot};

    (() => {
      const state = {
        snapshot: initialSnapshot,
        filter: "all",
        search: "",
        refreshing: false,
        error: "",
        nextRefreshAt: Date.now() + ((initialSnapshot.meta && initialSnapshot.meta.refreshIntervalMs) || ${AUTO_REFRESH_INTERVAL_MS}),
        detailRefreshCounter: 0,
      };

      const refs = {};
      const refreshIntervalMs = (initialSnapshot.meta && initialSnapshot.meta.refreshIntervalMs) || ${AUTO_REFRESH_INTERVAL_MS};

      const init = () => {
        refs.refreshButton = document.getElementById("refreshNow");
        refs.search = document.getElementById("hospitalSearch");
        refs.filterButtons = Array.from(document.querySelectorAll("[data-filter]"));
        refs.hospitalGrid = document.getElementById("hospitalGrid");
        refs.externalGrid = document.getElementById("externalGrid");
        refs.platformSummaryGrid = document.getElementById("platformSummaryGrid");
        refs.platformAppsGrid = document.getElementById("platformAppsGrid");
        refs.actionQueue = document.getElementById("actionQueue");
        refs.claimsSummaryGrid = document.getElementById("claimsSummaryGrid");
        refs.rejectionReasonGrid = document.getElementById("rejectionReasonGrid");
        refs.paymentSummaryGrid = document.getElementById("paymentSummaryGrid");
        refs.scannerMeta = document.getElementById("scannerMeta");
        refs.platformMeta = document.getElementById("platformMeta");
        refs.filterSummary = document.getElementById("filterSummary");
        refs.actionQueueMeta = document.getElementById("actionQueueMeta");
        refs.externalServiceMeta = document.getElementById("externalServiceMeta");
        refs.visibleHospitalCount = document.getElementById("visibleHospitalCount");
        refs.visibleActionCount = document.getElementById("visibleActionCount");
        refs.statAvailabilityPct = document.getElementById("statAvailabilityPct");
        refs.statAvailabilityMeta = document.getElementById("statAvailabilityMeta");
        refs.statAvgLatency = document.getElementById("statAvgLatency");
        refs.statLatencyMeta = document.getElementById("statLatencyMeta");
        refs.statMonitored = document.getElementById("statMonitored");
        refs.statMonitoredMeta = document.getElementById("statMonitoredMeta");
        refs.statActionCount = document.getElementById("statActionCount");
        refs.statActionMeta = document.getElementById("statActionMeta");
        refs.refreshState = document.getElementById("refreshState");
        refs.refreshCountdown = document.getElementById("refreshCountdown");
        refs.lastUpdated = document.getElementById("lastUpdated");
        refs.refreshError = document.getElementById("refreshError");
        refs.integrationGrid = document.getElementById("integrationGrid");
        refs.integrationStatus = document.getElementById("integrationStatus");
        refs.runIntegrationCheck = document.getElementById("runIntegrationCheck");
        refs.openTunnelRunbook = document.getElementById("openTunnelRunbook");
        refs.copyHealthCurl = document.getElementById("copyHealthCurl");
        refs.openRepoLink = document.getElementById("openRepoLink");

        refs.search.addEventListener("input", (event) => {
          state.search = event.target.value || "";
          renderHospitals();
        });

        refs.filterButtons.forEach((button) => {
          button.addEventListener("click", () => {
            state.filter = button.dataset.filter || "all";
            renderHospitals();
            updateFilterButtons();
          });
        });

        refs.refreshButton.addEventListener("click", () => refreshSnapshot(true));

        refs.runIntegrationCheck.addEventListener("click", async () => {
          refs.runIntegrationCheck.disabled = true;
          setIntegrationStatus("Running integration check...", false);
          try {
            const response = await fetch("/api/integrations?ts=" + Date.now(), {
              cache: "no-store",
              headers: { "Accept": "application/json" },
            });
            if (!response.ok) throw new Error("HTTP " + response.status);
            const integrations = await response.json();
            state.snapshot.integrations = integrations;
            renderIntegrations();
            setIntegrationStatus("Integration check completed.", false);
          } catch (error) {
            setIntegrationStatus("Integration check failed: " + (error.message || "unknown error"), true);
          } finally {
            refs.runIntegrationCheck.disabled = false;
          }
        });

        refs.openTunnelRunbook.addEventListener("click", () => {
          window.open("/runbooks/hospital-connectivity", "_blank", "noopener,noreferrer");
        });

        refs.copyHealthCurl.addEventListener("click", async () => {
          const cmd = "curl -fsSL https://portals.brainsait.org/api/health && curl -fsSL https://portals.brainsait.org/api/control-tower/summary";
          try {
            await navigator.clipboard.writeText(cmd);
            setIntegrationStatus("Health curl command copied to clipboard.", false);
          } catch {
            setIntegrationStatus("Clipboard blocked by browser; copy failed.", true);
          }
        });

        render();
        window.setInterval(() => refreshSnapshot(false), refreshIntervalMs);
        window.setInterval(updateRefreshStrip, 1000);
      };

      function escapeHtml(value) {
        return String(value || "").replace(/[&<>\"']/g, (char) => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[char]));
      }

      function severityLabel(severity) {
        const labels = {
          critical: "Critical",
          high: "High",
          medium: "Medium",
          info: "Stable",
        };
        return labels[severity] || severity;
      }

      function formatLatency(latency) {
        return typeof latency === "number" ? latency + " ms" : "No response";
      }

      function formatStatus(statusCode, error) {
        return statusCode ? "HTTP " + statusCode : (error || "Unavailable");
      }

      function renderHospitalCard(item) {
        return [
          '<article class="hospital-card tone-', escapeHtml(item.tone), '">',
            '<div class="hospital-top">',
              '<div>',
                '<p class="eyebrow">', escapeHtml(item.region), '</p>',
                '<h3>', escapeHtml(item.nameEn), '</h3>',
                '<div class="arabic-name">', escapeHtml(item.name), '</div>',
              '</div>',
              '<span class="status-chip ', escapeHtml(item.tone), '">', escapeHtml(item.healthLabel), '</span>',
            '</div>',
            '<p>', escapeHtml(item.signal), '</p>',
            '<div class="hospital-metrics">',
              '<div><span class="metric-label">Latency</span><strong>', escapeHtml(formatLatency(item.latency)), '</strong></div>',
              '<div><span class="metric-label">Status</span><strong>', escapeHtml(formatStatus(item.statusCode, item.error)), '</strong></div>',
            '</div>',
            '<div class="hospital-tags">',
              '<span>', escapeHtml(item.subdomain), '</span>',
              '<span>', escapeHtml(item.loginPath), '</span>',
            '</div>',
            item.online
              ? '<a href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener noreferrer" class="primary-link">Open Oracle Portal</a>'
              : '<span class="primary-link disabled-link">Portal unavailable</span>',
          '</article>'
        ].join('');
      }

      function renderExternalCard(item) {
        return [
          '<article class="service-card tone-', escapeHtml(item.tone), '">',
            '<div class="service-top">',
              '<div>',
                '<p class="eyebrow">External service</p>',
                '<h3>', escapeHtml(item.nameEn), '</h3>',
                '<div class="arabic-name">', escapeHtml(item.name), '</div>',
              '</div>',
              '<span class="status-chip ', escapeHtml(item.tone), '">', escapeHtml(item.healthLabel), '</span>',
            '</div>',
            '<p>', escapeHtml(item.description), '</p>',
            '<p>', escapeHtml(item.signal), '</p>',
            '<div class="service-metrics">',
              '<div><span class="metric-label">Latency</span><strong>', escapeHtml(formatLatency(item.latency)), '</strong></div>',
              '<div><span class="metric-label">Status</span><strong>', escapeHtml(formatStatus(item.statusCode, item.error)), '</strong></div>',
            '</div>',
            '<div class="service-meta">',
              '<span class="provider-pill">', escapeHtml(item.provider), '</span>',
              '<span>', escapeHtml(item.url), '</span>',
            '</div>',
            '<a href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener noreferrer" class="secondary-link">Open service</a>',
          '</article>'
        ].join('');
      }

      function renderActionCard(action) {
        return [
          '<article class="action-card severity-', escapeHtml(action.severity), '">',
            '<div class="action-top">',
              '<div>',
                '<span class="severity-badge ', escapeHtml(action.severity), '">', escapeHtml(severityLabel(action.severity)), '</span>',
                '<h3 style="margin-top:12px;">#', escapeHtml(action.rank), ' ', escapeHtml(action.title), '</h3>',
              '</div>',
              '<span class="owner-pill">', escapeHtml(action.owner), '</span>',
            '</div>',
            '<p>', escapeHtml(action.description), '</p>',
            '<div class="action-meta">',
              '<span>', escapeHtml(action.scope), '</span>',
              '<span>', escapeHtml(action.target), '</span>',
            '</div>',
            '<div class="action-recommendation">', escapeHtml(action.recommendation), '</div>',
            (action.runbookSummary ? '<p class="metric-note">Runbook: ' + escapeHtml(action.runbookSummary) + '</p>' : ''),
            '<div class="action-links">',
              '<a href="' + escapeHtml(action.href) + '" target="_blank" rel="noopener noreferrer" class="secondary-link">', escapeHtml(action.hrefLabel), '</a>',
              (action.runbookHref ? '<a href="' + escapeHtml(action.runbookHref) + '" target="_blank" rel="noopener noreferrer" class="secondary-link">Open runbook</a>' : ''),
              (action.escalationHref ? '<a href="' + escapeHtml(action.escalationHref) + '" target="_blank" rel="noopener noreferrer" class="secondary-link">' + escapeHtml(action.escalationLabel || 'Escalate') + '</a>' : ''),
            '</div>',
          '</article>'
        ].join('');
      }

      function renderPlatformAppCard(app) {
        return [
          '<article class="service-card tone-', escapeHtml(app.tone), '">',
            '<div class="service-top">',
              '<div>',
                '<p class="eyebrow">', escapeHtml(app.category), '</p>',
                '<h3>', escapeHtml(app.name), '</h3>',
              '</div>',
              '<span class="status-chip ', escapeHtml(app.tone), '">', escapeHtml(app.healthLabel), '</span>',
            '</div>',
            '<p>', escapeHtml(app.description), '</p>',
            '<p>', escapeHtml(app.signal), '</p>',
            '<div class="service-metrics">',
              '<div><span class="metric-label">', escapeHtml(app.metricPrimary.label), '</span><strong>', escapeHtml(app.metricPrimary.value), '</strong></div>',
              '<div><span class="metric-label">', escapeHtml(app.metricSecondary.label), '</span><strong>', escapeHtml(app.metricSecondary.value), '</strong></div>',
            '</div>',
            '<div class="service-meta">',
              '<span class="provider-pill">', escapeHtml(app.sourceType), '</span>',
              '<span>', escapeHtml(app.automationLabel), '</span>',
              '<span>', escapeHtml(app.sourceDetail), '</span>',
            '</div>',
            app.href
              ? '<a href="' + escapeHtml(app.href) + '" target="_blank" rel="noopener noreferrer" class="secondary-link">' + escapeHtml(app.hrefLabel) + '</a>'
              : '<span class="secondary-link disabled-link">' + escapeHtml(app.hrefLabel) + '</span>',
          '</article>'
        ].join('');
      }

      function renderClaimsSummaryCard(title, value, detail, note) {
        return [
          '<article class="stat-card">',
            '<strong>', escapeHtml(value), '</strong>',
            '<span>', escapeHtml(title), '</span>',
            '<small>', escapeHtml(detail), '</small>',
            (note ? '<div class="metric-note">' + escapeHtml(note) + '</div>' : ''),
          '</article>'
        ].join('');
      }

      function statusChipClass(status) {
        if (status === "healthy" || status === "connected") return "stable";
        if (status === "watch") return "watch";
        return "critical";
      }

      function renderIntegrations() {
        const i = state.snapshot.integrations || {};
        const cards = [
          {
            eyebrow: "Repository",
            title: (i.repo?.owner || "Fadil369") + "/" + (i.repo?.name || "oracle-setup"),
            status: i.repo?.status || "connected",
            signal: i.repo?.signal || "Repository integration available.",
            meta: "Branch: " + (i.repo?.branch || "main"),
            link: i.repo?.url || "https://github.com/Fadil369/oracle-setup",
            linkLabel: "Open GitHub repository",
          },
          {
            eyebrow: "Tunnel mesh",
            title: "Hospital branch tunnel posture",
            status: i.tunnel?.status || "degraded",
            signal: i.tunnel?.signal || "Tunnel state unavailable.",
            meta: (i.tunnel?.onlineHospitals || 0) + "/" + (i.tunnel?.totalHospitals || 0) + " branches online",
            link: i.tunnel?.runbookHref || "/runbooks/hospital-connectivity",
            linkLabel: "Open remediation runbook",
          },
          {
            eyebrow: "Portals plane",
            title: "Control tower API",
            status: i.portals?.status || "healthy",
            signal: i.portals?.signal || "Control plane status unavailable.",
            meta: i.portals?.summaryEndpoint || "/api/control-tower/summary",
            link: i.portals?.url || "https://portals.brainsait.org",
            linkLabel: "Open portals frontend",
          },
          {
            eyebrow: "Deployment API",
            title: "Oracle deployment orchestration",
            status: i.deploymentApi?.status || "watch",
            signal: i.deploymentApi?.signal || "Deployment API state unavailable.",
            meta: i.deploymentApi?.mode || "plan-only",
            link: i.deploymentApi?.endpoint || "/api/deploy/oracle",
            linkLabel: "Open deploy endpoint",
          },
          {
            eyebrow: "Scanner integration",
            title: "Oracle claim scanner feed",
            status: i.scanner?.status || "degraded",
            signal: i.scanner?.signal || "Scanner feed state unavailable.",
            meta: "Mode: " + (i.scanner?.mode || "fallback-reference"),
            link: "/api/control-tower/details",
            linkLabel: "Open detailed snapshot",
          },
        ];

        refs.integrationGrid.innerHTML = cards.map((card) => [
          '<article class="integration-card service-card tone-', escapeHtml(statusChipClass(card.status)), '">',
            '<div class="service-top">',
              '<div>',
                '<p class="eyebrow">', escapeHtml(card.eyebrow), '</p>',
                '<h3>', escapeHtml(card.title), '</h3>',
              '</div>',
              '<span class="status-chip ', escapeHtml(statusChipClass(card.status)), '">', escapeHtml(card.status), '</span>',
            '</div>',
            '<p>', escapeHtml(card.signal), '</p>',
            '<code>', escapeHtml(card.meta), '</code>',
            '<a class="secondary-link" href="', escapeHtml(card.link), '" target="_blank" rel="noopener noreferrer">', escapeHtml(card.linkLabel), '</a>',
          '</article>'
        ].join("")).join("");

        if (refs.openRepoLink && i.repo?.url) refs.openRepoLink.href = i.repo.url;
      }

      function setIntegrationStatus(message, isError) {
        refs.integrationStatus.textContent = message;
        refs.integrationStatus.style.color = isError ? "var(--coral)" : "rgba(255,255,255,0.74)";
      }

      function renderReasonCard(reason) {
        return [
          '<article class="service-card tone-', escapeHtml(reason.severity === 'critical' ? 'critical' : (reason.severity === 'high' ? 'watch' : 'stable')), '">',
            '<div class="service-top">',
              '<div>',
                '<p class="eyebrow">Rejection reason</p>',
                '<h3>', escapeHtml(reason.code), '</h3>',
              '</div>',
              '<span class="status-chip ', escapeHtml(reason.severity === 'critical' ? 'critical' : (reason.severity === 'high' ? 'watch' : 'stable')), '">', escapeHtml(reason.count + ' claims'), '</span>',
            '</div>',
            '<p>', escapeHtml(reason.name), '</p>',
            '<span class="reason-pill">', escapeHtml(reason.severity), ' priority</span>',
          '</article>'
        ].join('');
      }

      function updateFilterButtons() {
        refs.filterButtons.forEach((button) => {
          button.classList.toggle("active", button.dataset.filter === state.filter);
        });
      }

      function getVisibleHospitals() {
        const search = state.search.trim().toLowerCase();
        return state.snapshot.hospitals.filter((item) => {
          const matchesFilter = state.filter === "all" || item.tone === state.filter;
          if (!matchesFilter) return false;
          if (!search) return true;

          const haystack = [item.nameEn, item.name, item.region, item.subdomain]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(search);
        });
      }

      function renderSummary() {
        const summary = state.snapshot.summary;
        const claims = state.snapshot.claims;
        refs.statAvailabilityPct.textContent = summary.hospitals.availabilityPct + "%";
        refs.statAvailabilityMeta.textContent = summary.hospitals.online + " online / " + summary.hospitals.offline + " offline";
        refs.statAvgLatency.textContent = summary.overall.avgLatencyMs ? summary.overall.avgLatencyMs + " ms" : "N/A";
        refs.statLatencyMeta.textContent = summary.hospitals.degraded + " degraded hospitals / " + summary.externalServices.degraded + " degraded external services";
        refs.statMonitored.textContent = summary.overall.operationalSurfaces;
        refs.statMonitoredMeta.textContent = summary.hospitals.total + " hospitals + " + summary.externalServices.total + " external services + " + summary.platformApps.total + " platform apps";
        refs.statActionCount.textContent = summary.actions.total;
        refs.statActionMeta.textContent = summary.actions.critical + " critical / " + summary.actions.high + " high";
        refs.visibleActionCount.textContent = summary.actions.total;
        refs.actionQueueMeta.textContent = summary.actions.total
          ? summary.actions.critical + " critical, " + summary.actions.high + " high, and " + summary.actions.medium + " medium actions are open."
          : "No urgent actions are open. The queue is clear right now.";
        refs.externalServiceMeta.textContent = summary.externalServices.online + " of " + summary.externalServices.total + " external services reachable, " + summary.externalServices.degraded + " degraded.";
        refs.scannerMeta.textContent = claims.scanner.liveSystem && claims.scanner.liveSystem.available
          ? claims.sourceSummary + " Scanner metrics: " + claims.scanner.liveSystem.totalScans + " total scans, " + claims.scanner.liveSystem.failedScans + " failures, avg " + claims.scanner.liveSystem.avgDurationMs + " ms. NPHIES is " + claims.upstreams.nphies.label.toLowerCase() + "."
          : claims.sourceSummary + " Latest known batch: " + claims.scanner.latestBatch.errorCount + " route errors, processed " + claims.scanner.latestBatch.processed + " of " + claims.scanner.latestBatch.totalEligible + " eligible claims.";
        refs.lastUpdated.textContent = "Last probe: " + new Date(state.snapshot.timestamp).toUTCString();
        setIntegrationStatus("Integration fabric synced at " + new Date(state.snapshot.timestamp).toLocaleTimeString() + ".", false);
      }

      function renderHospitals() {
        const hospitals = getVisibleHospitals();
        refs.visibleHospitalCount.textContent = hospitals.length;
        refs.filterSummary.textContent = hospitals.length
          ? "Showing " + hospitals.length + " of " + state.snapshot.hospitals.length + " monitored hospital branches."
          : "No hospitals match the current search and filter.";
        refs.hospitalGrid.innerHTML = hospitals.length
          ? hospitals.map(renderHospitalCard).join("")
          : '<div class="empty-state">No hospitals match the current search or operational filter.</div>';
      }

      function renderExternalServices() {
        refs.externalGrid.innerHTML = state.snapshot.externalServices.length
          ? state.snapshot.externalServices.map(renderExternalCard).join("")
          : '<div class="empty-state">No external healthcare services are configured.</div>';
      }

      function renderClaims() {
        const claims = state.snapshot.claims;
        refs.claimsSummaryGrid.innerHTML = [
          renderClaimsSummaryCard("Claims in current appeal batch", String(claims.summary.totalClaims), claims.payer + " · " + claims.provider, claims.sourceSummary),
          renderClaimsSummaryCard("Ready for submission", String(claims.summary.readyClaims), claims.summary.readyPct + "% of batch is appeal-ready", claims.daysRemaining + " days remain in window"),
          renderClaimsSummaryCard("Blocked by recode", String(claims.summary.blockedClaims), claims.rejections.blockerIssue.code + " across " + claims.rejections.blockerIssue.affectedServiceItems + " service items", claims.rejections.blockerIssue.description),
          renderClaimsSummaryCard("Approval-sensitive claims", String(claims.approvals.priorAuthClaims), claims.approvals.criticalTherapyClaims + " critical therapy bundles and " + claims.approvals.coverageReviewClaims + " coverage reviews", "Approval portal: " + claims.upstreams.mohApproval.label + " · NPHIES: " + claims.upstreams.nphies.label),
        ].join("");

        refs.paymentSummaryGrid.innerHTML = [
          renderClaimsSummaryCard("Recoverable service items", String(claims.payments.recoverableServiceItems), claims.payments.recoverablePct + "% of disputed items are on ready claims", claims.payments.note),
          renderClaimsSummaryCard("Blocked service items", String(claims.payments.blockedServiceItems), "Held by recode blockers", "Move blocker claims first to protect payment recovery."),
          renderClaimsSummaryCard("Latest scan eligible claims", String(claims.scanner.latestBatch.totalEligible), claims.scanner.latestBatch.errorCount + " route errors in latest batch", (claims.scanner.latestBatch.sourceBatchId || claims.batchId) + " · " + claims.scanner.latestBatch.dominantError),
          renderClaimsSummaryCard("Critical claims", String(claims.criticalClaims.length), claims.criticalClaims.map((claim) => claim.bundleId.slice(0, 8) + ":" + claim.liveStatus).join(", "), "Live watchlist status for high-risk claims"),
        ].join("");

        refs.rejectionReasonGrid.innerHTML = claims.rejections.topReasons.length
          ? claims.rejections.topReasons.map(renderReasonCard).join("")
          : '<div class="empty-state">No rejection reasons available.</div>';
      }

      function renderPlatformApps() {
        const summary = state.snapshot.summary.platformApps;
        refs.platformSummaryGrid.innerHTML = [
          renderClaimsSummaryCard("Platform apps surfaced", String(summary.total), summary.live + " live services and " + summary.embedded + " embedded workflows", "Operational surfaces now include the rest of the platform stack."),
          renderClaimsSummaryCard("Stable app lanes", String(summary.stable), summary.watch + " watch and " + summary.critical + " critical", "Use the app posture to decide which lane needs engineering focus next."),
          renderClaimsSummaryCard("Live services", String(summary.live), "Services with direct runtime signal", "Oracle Claim Scanner currently anchors the live platform-service layer."),
          renderClaimsSummaryCard("Embedded automations", String(summary.embedded), "Pipelines and operator workflows", "These remain first-class platform apps even when they are embedded rather than publicly hosted."),
        ].join("");

        refs.platformMeta.textContent = summary.critical
          ? summary.critical + " platform apps are in critical state and " + summary.watch + " are under watch."
          : summary.watch
            ? summary.watch + " platform apps are under watch while the rest are ready."
            : "All platform apps are currently ready for the next operational cycle.";

        refs.platformAppsGrid.innerHTML = state.snapshot.platformApps.length
          ? state.snapshot.platformApps.map(renderPlatformAppCard).join("")
          : '<div class="empty-state">No platform apps are configured.</div>';
      }

      function renderActionQueue() {
        refs.actionQueue.innerHTML = state.snapshot.priorityActions.length
          ? state.snapshot.priorityActions.map(renderActionCard).join("")
          : '<div class="empty-state">No actions are currently queued.</div>';
      }

      function updateRefreshStrip() {
        refs.refreshButton.disabled = state.refreshing;
        refs.refreshButton.textContent = state.refreshing ? "Refreshing..." : "Refresh live data";
        refs.refreshState.textContent = state.refreshing ? "Refreshing live snapshot..." : "Auto refresh is active";
        const seconds = Math.max(0, Math.ceil((state.nextRefreshAt - Date.now()) / 1000));
        refs.refreshCountdown.textContent = state.refreshing ? "Please wait" : "Next refresh in " + seconds + "s";
        refs.refreshError.textContent = state.error ? "Refresh error: " + state.error : "";
        refs.refreshError.hidden = !state.error;
      }

      async function refreshSummary() {
        const response = await fetch("/api/control-tower/summary?ts=" + Date.now(), {
          cache: "no-store",
          headers: { "Accept": "application/json" },
        });

        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }

        const summarySnapshot = await response.json();
        state.snapshot = {
          ...state.snapshot,
          ...summarySnapshot,
          hospitals: summarySnapshot.hospitals,
          externalServices: summarySnapshot.externalServices,
          priorityActions: summarySnapshot.priorityActions,
          summary: {
            ...state.snapshot.summary,
            ...summarySnapshot.summary,
          },
          integrations: summarySnapshot.integrations || state.snapshot.integrations,
        };
      }

      async function refreshDetails() {
        const response = await fetch("/api/control-tower/details?ts=" + Date.now(), {
          cache: "no-store",
          headers: { "Accept": "application/json" },
        });

        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }

        const detailSnapshot = await response.json();
        state.snapshot = {
          ...state.snapshot,
          timestamp: detailSnapshot.timestamp || state.snapshot.timestamp,
          meta: detailSnapshot.meta || state.snapshot.meta,
          claims: detailSnapshot.claims || state.snapshot.claims,
          runbooks: detailSnapshot.runbooks || state.snapshot.runbooks,
          priorityActions: detailSnapshot.priorityActions || state.snapshot.priorityActions,
          summary: {
            ...state.snapshot.summary,
            ...(detailSnapshot.summary || {}),
            actions: detailSnapshot.summary?.actions || state.snapshot.summary?.actions,
            claims: detailSnapshot.summary?.claims || state.snapshot.summary?.claims,
          },
          integrations: detailSnapshot.integrations || state.snapshot.integrations,
        };
      }

      async function refreshSnapshot(manual) {
        if (state.refreshing) return;
        state.refreshing = true;
        updateRefreshStrip();

        try {
          await refreshSummary();
          state.detailRefreshCounter += 1;
          if (manual || state.detailRefreshCounter % 3 === 0) {
            await refreshDetails();
          }
          state.error = "";
          state.nextRefreshAt = Date.now() + (((state.snapshot.meta && state.snapshot.meta.refreshIntervalMs) || refreshIntervalMs));
          render();
        } catch (error) {
          state.error = error.message || "Unable to refresh control-tower snapshot";
          state.nextRefreshAt = Date.now() + refreshIntervalMs;
        } finally {
          state.refreshing = false;
          updateRefreshStrip();
        }
      }

      function render() {
        renderSummary();
        renderHospitals();
        renderExternalServices();
        renderClaims();
        renderPlatformApps();
        renderActionQueue();
        renderIntegrations();
        updateFilterButtons();
        updateRefreshStrip();
      }

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
      } else {
        init();
      }
    })();
  </script>
</body>
</html>`;
}

// ── Shared security headers (applied to every response) ──────────────────────
const SEC_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "Permissions-Policy": "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

// ── HTML Content-Security-Policy (dashboard pages) ───────────────────────────
const HTML_CSP = [
  "default-src 'self'",
  "script-src 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "connect-src 'self' https:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const HTML_HEADERS = {
  "Content-Type": "text/html;charset=utf-8",
  "Cache-Control": "no-store",
  "Content-Security-Policy": HTML_CSP,
  ...SEC_HEADERS,
};

function htmlResponse(markup, status = 200) {
  return new Response(markup, {
    status,
    headers: HTML_HEADERS,
  });
}

function json(data, status = 200, extraOrContext = {}) {
  const hasRequestContext = !!(extraOrContext && extraOrContext.request && extraOrContext.env);
  const origin = hasRequestContext
    ? resolveCorsOrigin(extraOrContext.request, extraOrContext.env)
    : "https://portals.brainsait.org";

  const extraHeaders = hasRequestContext
    ? {}
      : (extraOrContext || {});

  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    "X-Robots-Tag": "noindex, nofollow",
    ...SEC_HEADERS,
    Vary: "Origin",
  };

  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  Object.assign(headers, extraHeaders);

  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers,
  });
}

function escapeHtmlBasic(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
