"use client";

import { motion } from "framer-motion";
import {
  Activity,
  Gauge,
  Languages,
  MessageSquare,
  Radio,
  RefreshCw,
  ShieldCheck,
  Timer,
  Wifi,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ServiceStatus = "operational" | "degraded" | "offline" | "incident";

interface PlatformService {
  id: string;
  name: string;
  status: ServiceStatus;
  latencyMs: number;
  httpCode: number;
  endpoint: string;
}

interface PlatformStatusResponse {
  status: ServiceStatus;
  timestamp: number;
  summary: {
    averageLatencyMs: number;
    websocketReady: boolean;
    widgetReady: boolean;
  };
  services: PlatformService[];
  links: {
    dashboard: string;
    widget: string;
    voice: string;
  };
}

const COPY = {
  en: {
    title: "Platform Status",
    subtitle: "Realtime operational visibility for Basma AI across web, voice, and widget channels.",
    languageSwitch: "العربية",
    overview: "Control Tower",
    cards: {
      status: "Overall Health",
      latency: "Average Latency",
      websocket: "Voice WebSocket",
      widget: "Widget Readiness",
    },
    labels: {
      operational: "Operational",
      degraded: "Degraded",
      incident: "Incident",
      offline: "Offline",
      connected: "Connected",
      disconnected: "Disconnected",
      active: "Active",
      inactive: "Inactive",
      endpoint: "Endpoint",
      service: "Service",
      state: "State",
      latency: "Latency",
      code: "Code",
      refreshed: "Last refreshed",
      refresh: "Refresh",
    },
  },
  ar: {
    title: "حالة المنصة",
    subtitle: "مراقبة تشغيلية لحظية لبسمة عبر الويب والصوت والودجت.",
    languageSwitch: "English",
    overview: "برج التحكم",
    cards: {
      status: "الصحة العامة",
      latency: "متوسط الاستجابة",
      websocket: "اتصال الصوت اللحظي",
      widget: "جاهزية الودجت",
    },
    labels: {
      operational: "تشغيل طبيعي",
      degraded: "أداء متراجع",
      incident: "حادث تشغيلي",
      offline: "متوقف",
      connected: "متصل",
      disconnected: "غير متصل",
      active: "نشط",
      inactive: "غير نشط",
      endpoint: "الرابط",
      service: "الخدمة",
      state: "الحالة",
      latency: "الاستجابة",
      code: "الرمز",
      refreshed: "آخر تحديث",
      refresh: "تحديث",
    },
  },
} as const;

const FALLBACK_STATUS: PlatformStatusResponse = {
  status: "degraded",
  timestamp: Date.now(),
  summary: {
    averageLatencyMs: 0,
    websocketReady: false,
    widgetReady: false,
  },
  services: [],
  links: {
    dashboard: "https://bsma.brainsait.org",
    widget: "https://basma.brainsait.org/widget.js",
    voice: "https://basma-voice.brainsait.org",
  },
};

const API_BASE = process.env.NEXT_PUBLIC_BASMA_API_URL || "https://basma-api.brainsait.org";

export default function Dashboard() {
  const [locale, setLocale] = useState<"en" | "ar">("en");
  const [statusData, setStatusData] = useState<PlatformStatusResponse>(FALLBACK_STATUS);
  const [isLoading, setIsLoading] = useState(true);

  const copy = COPY[locale];
  const directionClass = locale === "ar" ? "rtl" : "ltr";

  const statusLabel = useMemo(() => {
    const value = statusData.status;
    return copy.labels[value] || value;
  }, [copy.labels, statusData.status]);

  async function fetchPlatformStatus() {
    try {
      const response = await fetch(`${API_BASE}/public/platform-status`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Status request failed: ${response.status}`);
      }

      const payload = (await response.json()) as PlatformStatusResponse;
      setStatusData(payload);
    } catch {
      setStatusData((previous) => ({
        ...previous,
        status: "degraded",
        timestamp: Date.now(),
      }));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchPlatformStatus();
    const timer = setInterval(fetchPlatformStatus, 15000);
    return () => clearInterval(timer);
  }, []);

  const healthCards = [
    {
      key: "status",
      label: copy.cards.status,
      value: statusLabel,
      icon: ShieldCheck,
    },
    {
      key: "latency",
      label: copy.cards.latency,
      value: `${statusData.summary.averageLatencyMs || "--"}ms`,
      icon: Timer,
    },
    {
      key: "websocket",
      label: copy.cards.websocket,
      value: statusData.summary.websocketReady ? copy.labels.connected : copy.labels.disconnected,
      icon: Wifi,
    },
    {
      key: "widget",
      label: copy.cards.widget,
      value: statusData.summary.widgetReady ? copy.labels.active : copy.labels.inactive,
      icon: Radio,
    },
  ];

  return (
    <main className={`min-h-screen px-5 py-8 md:px-10 md:py-10 ${directionClass}`}>
      <div className="mx-auto max-w-7xl space-y-8">
        <motion.section
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-3xl p-6 md:p-8"
        >
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
                <Activity size={13} />
                {copy.overview}
              </p>
              <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">{copy.title}</h1>
              <p className="max-w-3xl text-sm text-slate-200/80 md:text-base">{copy.subtitle}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setLocale((value) => (value === "en" ? "ar" : "en"))}
                className="rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-white/10"
              >
                <span className="inline-flex items-center gap-2">
                  <Languages size={16} />
                  {copy.languageSwitch}
                </span>
              </button>
              <button
                onClick={fetchPlatformStatus}
                className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                <span className="inline-flex items-center gap-2">
                  <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
                  {copy.labels.refresh}
                </span>
              </button>
            </div>
          </div>
        </motion.section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {healthCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <motion.article
                key={card.key}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.07 }}
                className="glass rounded-2xl p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-300/80">{card.label}</p>
                    <p className="mt-3 text-2xl font-semibold text-white">{card.value}</p>
                  </div>
                  <span className="rounded-xl border border-white/20 bg-white/10 p-2 text-cyan-200">
                    <Icon size={18} />
                  </span>
                </div>
              </motion.article>
            );
          })}
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <article className="glass overflow-hidden rounded-3xl lg:col-span-2">
            <header className="flex items-center justify-between border-b border-white/10 px-5 py-4 md:px-6">
              <h2 className="text-lg font-semibold">{copy.title}</h2>
              <span className="inline-flex items-center gap-2 text-xs text-slate-300">
                <span className={`status-dot status-${statusData.status}`} />
                {statusLabel}
              </span>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-white/5 text-xs uppercase tracking-[0.14em] text-slate-300/80">
                  <tr>
                    <th className="px-6 py-4 text-start">{copy.labels.service}</th>
                    <th className="px-6 py-4 text-start">{copy.labels.state}</th>
                    <th className="px-6 py-4 text-start">{copy.labels.latency}</th>
                    <th className="px-6 py-4 text-start">{copy.labels.code}</th>
                    <th className="px-6 py-4 text-start">{copy.labels.endpoint}</th>
                  </tr>
                </thead>
                <tbody>
                  {statusData.services.map((service) => (
                    <tr key={service.id} className="border-t border-white/5 hover:bg-white/5">
                      <td className="px-6 py-4 font-medium">{service.name}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-2">
                          <span className={`status-dot status-${service.status}`} />
                          {copy.labels[service.status] || service.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">{service.latencyMs}ms</td>
                      <td className="px-6 py-4">{service.httpCode || "-"}</td>
                      <td className="px-6 py-4 text-xs text-cyan-100/90">{service.endpoint}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <aside className="space-y-5">
            <article className="glass rounded-3xl p-5">
              <h3 className="mb-3 flex items-center gap-2 text-base font-semibold">
                <Gauge size={18} className="text-cyan-200" />
                {copy.labels.refreshed}
              </h3>
              <p className="text-sm text-slate-300">
                {new Date(statusData.timestamp).toLocaleString(locale === "ar" ? "ar-SA" : "en-US")}
              </p>
              <p className="mt-3 text-xs text-slate-400">Polling every 15 seconds</p>
            </article>

            <article className="glass rounded-3xl p-5">
              <h3 className="mb-3 flex items-center gap-2 text-base font-semibold">
                <MessageSquare size={18} className="text-orange-200" />
                Live Channels
              </h3>
              <ul className="space-y-3 text-sm text-slate-200/90">
                <li className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">Dashboard: {statusData.links.dashboard}</li>
                <li className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">Voice: {statusData.links.voice}</li>
                <li className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">Widget: {statusData.links.widget}</li>
              </ul>
            </article>
          </aside>
        </section>
        <div>
          {isLoading ? <p className="text-xs text-slate-400">Loading platform status...</p> : null}
        </div>
      </div>
    </main>
  );
}
