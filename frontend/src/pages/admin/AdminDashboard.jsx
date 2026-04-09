import { useEffect, useMemo, useState } from "react";
import adminApi from "../../services/admin.api";
import { useTheme } from "../../context/ThemeContext";

export default function AdminDashboard() {
    const { theme } = useTheme();
    const isDark = theme === "dark";
    const [stats, setStats] = useState({
        totalUsers: 0,
        activeCards: 0,
        dailyScans: 0,
        emergencyAccess: 0,
    });
    const [logs, setLogs] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            adminApi.getStatistics(),
            adminApi.getAuditLogs(),
            adminApi.getUsers(),
        ])
            .then(([statsResponse, logsResponse, usersResponse]) => {
                setStats({
                    totalUsers: Number(statsResponse.totalUsers || 0),
                    activeCards: Number(statsResponse.activeCards || 0),
                    dailyScans: Number(statsResponse.dailyScans || 0),
                    emergencyAccess: Number(statsResponse.emergencyAccess || 0),
                });
                setLogs(logsResponse || []);
                setUsers(usersResponse || []);
            })
            .catch((error) => {
                console.error("Failed to load admin dashboard data:", error);
            })
            .finally(() => {
                setLoading(false);
            });
    }, []);

    const roleSummary = useMemo(() => {
        const roles = [
            { key: "admin", label: "System Root" },
            { key: "hospital", label: "Hospitals" },
            { key: "doctor", label: "Doctors" },
            { key: "medical_shop", label: "Pharmacies" },
            { key: "patient", label: "Patients" },
        ];

        const counts = users.reduce((acc, user) => {
            acc[user.role] = (acc[user.role] || 0) + 1;
            return acc;
        }, {});

        return roles.map((role) => ({
            ...role,
            count: counts[role.key] || 0,
        }));
    }, [users]);

    const activitySeries = useMemo(() => {
        const byDay = new Map();

        logs.forEach((log) => {
            const label = log.timestamp
                ? new Date(log.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                : "Unknown";
            byDay.set(label, (byDay.get(label) || 0) + 1);
        });

        const points = Array.from(byDay.entries())
            .slice(-7)
            .map(([label, value]) => ({ label, value }));

        return points.length ? points : [{ label: "No Data", value: 0 }];
    }, [logs]);

    const chartMax = useMemo(() => Math.max(...activitySeries.map((item) => item.value), 1), [activitySeries]);

    const healthMetrics = useMemo(() => {
        const adoption = stats.totalUsers > 0 ? Math.round((stats.activeCards / stats.totalUsers) * 100) : 0;
        const scanRate = stats.activeCards > 0 ? Math.min(100, Math.round((stats.dailyScans / stats.activeCards) * 100)) : 0;
        const incidentPressure = Math.min(100, stats.emergencyAccess * 12);
        const directoryCoverage = stats.totalUsers > 0 ? Math.min(100, Math.round((users.length / stats.totalUsers) * 100)) : 0;

        return [
            { label: "Card adoption", value: adoption, tone: "emerald" },
            { label: "Directory coverage", value: directoryCoverage, tone: "sky" },
            { label: "Scan throughput", value: scanRate, tone: "amber" },
            { label: "Incident pressure", value: incidentPressure, tone: "rose" },
        ];
    }, [stats, users]);

    const recentUsers = useMemo(() => users.slice(0, 5), [users]);
    const latestLogs = useMemo(() => logs.slice(0, 5), [logs]);
    const commandBrief = useMemo(() => {
        const dominantRole = [...roleSummary].sort((a, b) => b.count - a.count)[0];
        return {
            dominantRole: dominantRole?.label || "No active domains",
            activeShare: stats.totalUsers > 0 ? Math.round((stats.activeCards / stats.totalUsers) * 100) : 0,
        };
    }, [roleSummary, stats]);

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <div className={`flex items-center gap-4 rounded-2xl border px-6 py-4 ${isDark ? "border-slate-800 bg-slate-900/70 text-slate-200" : "border-slate-200 bg-white text-slate-700 shadow-sm"}`}>
                    <div className="size-8 animate-spin rounded-full border-4 border-emerald-400 border-t-transparent" />
                    <span className="text-sm font-bold tracking-wide">Loading system root telemetry...</span>
                </div>
            </div>
        );
    }

    return (
        <div className={`space-y-8 ${isDark ? "text-white" : "text-slate-900"}`}>
            <section className={`relative overflow-hidden rounded-[36px] border p-8 lg:p-10 ${isDark
                ? "border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(226,232,240,0.14),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.16),_transparent_28%),linear-gradient(145deg,_#0f172a_0%,_#0b1120_46%,_#020617_100%)] shadow-[0_30px_80px_rgba(2,6,23,0.55)]"
                : "border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.9),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.12),_transparent_28%),linear-gradient(145deg,_#f8fafc_0%,_#eef2ff_46%,_#e2e8f0_100%)] shadow-[0_24px_60px_rgba(148,163,184,0.18)]"}`}>
                <div className={`absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:28px_28px] ${isDark ? "opacity-15" : "opacity-30"}`} />
                <div className={`absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent ${isDark ? "via-white/40" : "via-slate-400/40"} to-transparent`} />
                <div className="relative grid gap-8 xl:grid-cols-[1.45fr_0.9fr] xl:items-end">
                    <div className="max-w-3xl space-y-6">
                        <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.28em] backdrop-blur-md ${isDark ? "border-emerald-400/20 bg-white/5 text-emerald-200" : "border-emerald-200 bg-white/70 text-emerald-700"}`}>
                            <span className="size-2 rounded-full bg-emerald-400" />
                            System Root Online
                        </div>
                        <div className="space-y-4">
                            <h1 className={`max-w-4xl text-4xl font-black tracking-[-0.04em] lg:text-6xl ${isDark ? "text-white" : "text-slate-900"}`}>Unified Smart-ID Executive Control Surface</h1>
                            <p className={`max-w-2xl text-sm leading-7 lg:text-base ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                                Premium root visibility across identity issuance, access assurance, emergency escalation, and trust telemetry for the entire Smart-ID network.
                            </p>
                        </div>
                        <div className="grid gap-4 md:grid-cols-3">
                            <ExecutiveChip label="Primary domain" value={commandBrief.dominantRole} isDark={isDark} />
                            <ExecutiveChip label="Card activation" value={`${commandBrief.activeShare}%`} isDark={isDark} />
                            <ExecutiveChip label="Audit cadence" value={logs.length ? "Monitored" : "Awaiting flow"} isDark={isDark} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">
                        <SignalPill label="API" value="Live" tone="emerald" isDark={isDark} />
                        <SignalPill label="Audit" value={logs.length ? "Flowing" : "Idle"} tone="sky" isDark={isDark} />
                        <SignalPill label="Cards" value={stats.activeCards} tone="amber" isDark={isDark} />
                        <SignalPill label="Alerts" value={stats.emergencyAccess} tone="rose" isDark={isDark} />
                    </div>
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
                <KpiCard label="Total identities" value={stats.totalUsers} helper="Registered users across all domains" tone="emerald" isDark={isDark} />
                <KpiCard label="Active smart cards" value={stats.activeCards} helper="Linked and ready for live access" tone="sky" isDark={isDark} />
                <KpiCard label="Daily audit events" value={stats.dailyScans} helper="Recent interactions in the last 24h" tone="amber" isDark={isDark} />
                <KpiCard label="Emergency overrides" value={stats.emergencyAccess} helper="Critical-access interventions recorded" tone="rose" isDark={isDark} />
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
                <Panel title="Audit velocity" subtitle="Recent command traffic across the network" isDark={isDark}>
                    <div className="space-y-6">
                        <div className={`flex h-64 items-end gap-3 rounded-[28px] border p-6 ${isDark ? "border-white/5 bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(2,6,23,0.9))] shadow-inner shadow-black/20" : "border-slate-200 bg-white/80 shadow-inner shadow-slate-200/60"}`}>
                            {activitySeries.map((point) => (
                                <div key={point.label} className="flex flex-1 flex-col items-center justify-end gap-3">
                                    <div className="w-full rounded-2xl bg-gradient-to-t from-emerald-500 via-emerald-400 to-emerald-300 shadow-[0_12px_30px_rgba(16,185,129,0.25)]" style={{ height: `${Math.max(12, Math.round((point.value / chartMax) * 100))}%` }} />
                                    <div className="text-center">
                                        <div className={`text-xs font-black ${isDark ? "text-slate-200" : "text-slate-700"}`}>{point.value}</div>
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{point.label}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="grid gap-3 md:grid-cols-3">
                            {roleSummary.slice(0, 3).map((item) => (
                                <div key={item.key} className={`rounded-[22px] border px-4 py-4 backdrop-blur-sm ${isDark ? "border-white/5 bg-white/[0.03]" : "border-slate-200 bg-white/80"}`}>
                                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{item.label}</div>
                                    <div className={`mt-2 text-2xl font-black ${isDark ? "text-white" : "text-slate-900"}`}>{item.count}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </Panel>

                <Panel title="System health" subtitle="Live operational posture" isDark={isDark}>
                    <div className="space-y-5">
                        {healthMetrics.map((metric) => (
                            <HealthMeter key={metric.label} {...metric} isDark={isDark} />
                        ))}

                        <div className={`rounded-[28px] border p-5 backdrop-blur-sm ${isDark ? "border-white/5 bg-white/[0.03]" : "border-slate-200 bg-white/80"}`}>
                            <div className="mb-4 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Role distribution</div>
                            <div className="space-y-3">
                                {roleSummary.map((item) => (
                                    <div key={item.key} className="flex items-center justify-between text-sm">
                                        <span className={`font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>{item.label}</span>
                                        <span className={`font-black ${isDark ? "text-white" : "text-slate-900"}`}>{item.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </Panel>
            </section>

            <section className="grid gap-6 2xl:grid-cols-[1.2fr_1fr]">
                <Panel title="Recent audit trail" subtitle="Latest verified root-visible actions" isDark={isDark}>
                    <div className="space-y-3">
                        {latestLogs.length > 0 ? latestLogs.map((log) => (
                            <div key={log.id} className={`flex flex-col gap-4 rounded-[24px] border p-5 backdrop-blur-sm lg:flex-row lg:items-center lg:justify-between ${isDark ? "border-white/5 bg-white/[0.03]" : "border-slate-200 bg-white/80"}`}>
                                <div className="flex items-start gap-4">
                                    <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
                                        <span className="material-symbols-outlined">
                                            {log.action?.includes("NFC") ? "contactless" : log.action?.includes("EMERGENCY") ? "emergency" : log.action?.includes("LOGIN") ? "login" : "data_usage"}
                                        </span>
                                    </div>
                                    <div className="space-y-1">
                                        <div className={`text-sm font-black uppercase tracking-wide ${isDark ? "text-white" : "text-slate-900"}`}>{(log.action || "Unknown event").replace(/_/g, " ")}</div>
                                        <div className={`text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}>{log.actorName || "Unknown user"} {"->"} {log.targetName || log.resource || "System"}</div>
                                        {log.reason && (
                                            <div className="text-xs text-rose-500">{log.reason}</div>
                                        )}
                                    </div>
                                </div>
                                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                                    {log.timestamp ? new Date(log.timestamp).toLocaleString() : "N/A"}
                                </div>
                            </div>
                        )) : (
                            <EmptyState text="No audit events available yet." isDark={isDark} />
                        )}
                    </div>
                </Panel>

                <Panel title="Newest identities" subtitle="Most recent accounts visible to system root" isDark={isDark}>
                    <div className="space-y-3">
                        {recentUsers.length > 0 ? recentUsers.map((user) => (
                            <div key={user.id} className={`flex items-center justify-between rounded-[22px] border px-5 py-4 backdrop-blur-sm ${isDark ? "border-white/5 bg-white/[0.03]" : "border-slate-200 bg-white/80"}`}>
                                <div className="flex items-center gap-4">
                                    <div className={`flex size-11 items-center justify-center rounded-2xl text-sm font-black ${isDark ? "bg-slate-800 text-emerald-300" : "bg-slate-100 text-emerald-700"}`}>
                                        {(user.name || "U").charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className={`font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{user.name}</div>
                                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{user.username}</div>
                                    </div>
                                </div>
                                <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${isDark ? "border-slate-700 bg-slate-900 text-slate-300" : "border-slate-200 bg-slate-100 text-slate-700"}`}>
                                    {String(user.role).replace("_", " ")}
                                </span>
                            </div>
                        )) : (
                            <EmptyState text="No user identities available yet." isDark={isDark} />
                        )}
                    </div>
                </Panel>
            </section>
        </div>
    );
}

function Panel({ title, subtitle, children, isDark }) {
    return (
        <section className={`rounded-[30px] border p-6 lg:p-7 ${isDark ? "border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] shadow-[0_24px_60px_rgba(2,6,23,0.35)]" : "border-slate-200 bg-white/90 shadow-[0_16px_40px_rgba(148,163,184,0.18)]"}`}>
            <div className="mb-6 flex flex-col gap-2">
                <h2 className={`text-xl font-black tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>{title}</h2>
                <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>{subtitle}</p>
            </div>
            {children}
        </section>
    );
}

function KpiCard({ label, value, helper, tone, isDark }) {
    const toneClass = {
        emerald: isDark ? "from-emerald-500/18 via-emerald-500/6 to-white/[0.02]" : "from-emerald-100 via-white to-white",
        sky: isDark ? "from-sky-500/18 via-sky-500/6 to-white/[0.02]" : "from-sky-100 via-white to-white",
        amber: isDark ? "from-amber-500/18 via-amber-500/6 to-white/[0.02]" : "from-amber-100 via-white to-white",
        rose: isDark ? "from-rose-500/18 via-rose-500/6 to-white/[0.02]" : "from-rose-100 via-white to-white",
    }[tone];

    return (
        <div className={`rounded-[28px] border bg-gradient-to-br ${toneClass} p-6 ${isDark ? "border-white/10 shadow-[0_18px_40px_rgba(2,6,23,0.22)]" : "border-slate-200 shadow-[0_12px_30px_rgba(148,163,184,0.16)]"}`}>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</div>
            <div className={`mt-4 text-4xl font-black tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>{Number(value).toLocaleString()}</div>
            <div className={`mt-2 text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}>{helper}</div>
        </div>
    );
}

function SignalPill({ label, value, tone, isDark }) {
    const toneClass = {
        emerald: isDark ? "border-emerald-400/15 bg-white/[0.04] text-emerald-200" : "border-emerald-200 bg-emerald-50 text-emerald-700",
        sky: isDark ? "border-sky-400/15 bg-white/[0.04] text-sky-200" : "border-sky-200 bg-sky-50 text-sky-700",
        amber: isDark ? "border-amber-400/15 bg-white/[0.04] text-amber-200" : "border-amber-200 bg-amber-50 text-amber-700",
        rose: isDark ? "border-rose-400/15 bg-white/[0.04] text-rose-200" : "border-rose-200 bg-rose-50 text-rose-700",
    }[tone];

    return (
        <div className={`rounded-[20px] border px-4 py-3 backdrop-blur-md ${isDark ? "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" : "shadow-sm"} ${toneClass}`}>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] opacity-80">{label}</div>
            <div className={`mt-1 text-lg font-black ${isDark ? "text-white" : "text-slate-900"}`}>{typeof value === "number" ? value.toLocaleString() : value}</div>
        </div>
    );
}

function HealthMeter({ label, value, tone, isDark }) {
    const barClass = {
        emerald: "bg-emerald-400",
        sky: "bg-sky-400",
        amber: "bg-amber-400",
        rose: "bg-rose-400",
    }[tone];

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
                <span className={`font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>{label}</span>
                <span className={`font-black ${isDark ? "text-white" : "text-slate-900"}`}>{value}%</span>
            </div>
            <div className={`h-2 overflow-hidden rounded-full ${isDark ? "bg-slate-800" : "bg-slate-200"}`}>
                <div className={`h-full rounded-full ${barClass}`} style={{ width: `${value}%` }} />
            </div>
        </div>
    );
}

function EmptyState({ text, isDark }) {
    return (
        <div className={`rounded-[24px] border px-5 py-10 text-center text-sm font-medium ${isDark ? "border-dashed border-slate-700 bg-slate-950/50 text-slate-500" : "border-dashed border-slate-300 bg-slate-50 text-slate-500"}`}>
            {text}
        </div>
    );
}

function ExecutiveChip({ label, value, isDark }) {
    return (
        <div className={`rounded-[22px] border px-5 py-4 backdrop-blur-md ${isDark ? "border-white/10 bg-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" : "border-slate-200 bg-white/70 shadow-sm"}`}>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{label}</div>
            <div className={`mt-2 text-base font-black ${isDark ? "text-white" : "text-slate-900"}`}>{value}</div>
        </div>
    );
}
