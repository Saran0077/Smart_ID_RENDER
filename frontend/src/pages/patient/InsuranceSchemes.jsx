import { useEffect, useState } from "react";
import patientApi from "../../services/patient.api";
import { useTheme } from "../../context/ThemeContext";

const SCHEMES = [
  {
    code: "CMCHIS",
    title: "CMCHIS",
    description: "Chief Minister's Comprehensive Health Insurance (Tamil Nadu).",
    link: "https://www.cmchistn.com",
    isGov: true
  },
  {
    code: "PMJAY",
    title: "Ayushman Bharat (PM-JAY)",
    description: "Central government healthcare safety net for vulnerable families.",
    link: "https://pmjay.gov.in",
    isGov: true
  },
  {
    code: "TN_UHS",
    title: "Urban Health Scheme",
    description: "Specialized coverage for TN government employees and pensioners.",
    link: "https://tnuhs.tn.gov.in",
    isGov: true
  },
  {
    code: "STAR_HEALTH",
    title: "Star Health",
    description: "Comprehensive private health insurance plans with local network focus.",
    link: "https://www.starhealth.in",
    isGov: false
  },
  {
    code: "HDFC_ERGO",
    title: "HDFC ERGO Health",
    description: "Premium private insurance with global standards and fast claims.",
    link: "https://www.hdfcergo.com/health-insurance",
    isGov: false
  },
  {
    code: "ICICI_LOMBARD",
    title: "ICICI Lombard",
    description: "Reliable health insurance coverage with 6000+ hospital network.",
    link: "https://www.icicilombard.com/health-insurance",
    isGov: false
  }
];

export default function InsuranceSchemes() {
    const { theme } = useTheme();
    const isDark = theme === "dark";

    const [loading, setLoading] = useState(true);
    const [patientInfo, setPatientInfo] = useState(null);
    const [activityRows, setActivityRows] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [profileData, emrData, auditData, prescriptionData] = await Promise.all([
                    patientApi.getProfile().catch(() => null),
                    patientApi.getPatientEMR().catch(() => null),
                    patientApi.getPatientAuditLog().catch(() => []),
                    patientApi.getPrescriptions().catch(() => ({ prescriptions: [] }))
                ]);

                if (profileData) {
                    setPatientInfo({
                        age: profileData.age,
                        gender: profileData.gender,
                        bloodGroup: profileData.bloodGroup,
                        phone: profileData.phone,
                        allergies: profileData.allergies || [],
                        surgeries: profileData.surgeries || []
                    });
                }

                const liveActivities = [
                    ...((emrData?.visits || []).map((visit, index) => ({
                        id: `visit-${index}-${visit.date || index}`,
                        type: "Medical visit",
                        source: visit.hospital || "Hospital not recorded",
                        detail: visit.summary,
                        date: visit.date,
                        badge: visit.category || "Visit"
                    }))),
                    ...((prescriptionData?.prescriptions || []).map((prescription) => ({
                        id: `rx-${prescription.id}`,
                        type: "Prescription",
                        source: prescription.hospital || "Hospital not recorded",
                        detail: prescription.notes || prescription.name,
                        date: prescription.issuedAt,
                        badge: `${prescription.sourceLabel || "Care team"} • ${prescription.name}`
                    }))),
                    ...((auditData || []).map((entry) => ({
                        id: `audit-${entry.id || entry.createdAt}`,
                        type: "Access log",
                        source: entry.actorName || entry.actorRole || "System",
                        detail: entry.action,
                        date: entry.createdAt || entry.timestamp,
                        badge: entry.method || entry.resource || "Audit"
                    })))
                ]
                    .filter((entry) => entry.date)
                    .sort((left, right) => new Date(right.date) - new Date(left.date))
                    .slice(0, 12);

                setActivityRows(liveActivities);
            } catch (error) {
                console.error("Failed to fetch insurance data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-emerald-500"></div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-7xl animate-in px-6 py-10 pb-20 fade-in slide-in-from-bottom-5 duration-700 lg:px-12">
            <header className="mb-12">
                <div className="mb-3 flex items-center gap-4">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
                        <span className="material-symbols-outlined text-3xl">policy</span>
                    </div>
                    <h1 className={`text-4xl font-black tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                        Insurance Command Center
                    </h1>
                </div>
                <p className={`ml-16 text-lg ${isDark ? "text-slate-500" : "text-slate-500"}`}>
                    Official scheme links alongside your real Smart-ID activity trail.
                </p>
                {patientInfo && (
                    <div className={`ml-16 mt-4 inline-flex items-center gap-3 rounded-xl px-4 py-2 text-xs font-bold ${isDark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600"}`}>
                        <span className="material-symbols-outlined text-sm">person</span>
                        Profile: {patientInfo.gender || "Not set"} | Age: {patientInfo.age || "N/A"} | Blood: {patientInfo.bloodGroup || "N/A"} | Phone: {patientInfo.phone || "N/A"}
                    </div>
                )}
            </header>

            <section className="mb-20">
                <h2 className="mb-8 flex items-center gap-3 text-xs font-black uppercase tracking-[0.2em] text-emerald-500">
                    <span className="h-[1px] w-8 bg-emerald-500/30"></span>
                    Official Scheme Directory
                </h2>

                <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                    {SCHEMES.map((scheme) => (
                        <SchemeCard key={scheme.code} scheme={scheme} isDark={isDark} />
                    ))}
                </div>
            </section>

            <div className="grid grid-cols-1 gap-12 xl:grid-cols-12">
                <section className="xl:col-span-8">
                    <h2 className="mb-6 flex items-center gap-3 text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                        <span className="h-[1px] w-8 bg-slate-500/30"></span>
                        Live Activity Trail
                    </h2>

                    <div className={`overflow-hidden rounded-[2.5rem] border shadow-2xl ${isDark ? "border-slate-800 bg-[#0f172a]" : "border-slate-200 bg-white"}`}>
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left">
                                <thead>
                                    <tr className={`border-b ${isDark ? "border-slate-800 bg-slate-900/50" : "border-slate-200 bg-slate-50"}`}>
                                        <th className={`px-8 py-5 text-[10px] font-black uppercase tracking-widest ${isDark ? "text-slate-400" : "text-slate-500"}`}>Reference ID</th>
                                        <th className={`px-8 py-5 text-[10px] font-black uppercase tracking-widest ${isDark ? "text-slate-400" : "text-slate-500"}`}>Activity</th>
                                        <th className={`px-8 py-5 text-[10px] font-black uppercase tracking-widest ${isDark ? "text-slate-400" : "text-slate-500"}`}>Source</th>
                                        <th className={`px-8 py-5 text-right text-[10px] font-black uppercase tracking-widest ${isDark ? "text-slate-400" : "text-slate-500"}`}>Detail</th>
                                    </tr>
                                </thead>
                                <tbody className={`divide-y ${isDark ? "divide-slate-800" : "divide-slate-200"}`}>
                                    {activityRows.map((entry) => (
                                        <tr key={entry.id} className={`group transition-all ${isDark ? "hover:bg-slate-800/30" : "hover:bg-slate-50"}`}>
                                            <td className="px-8 py-6">
                                                <span className="font-mono font-bold text-emerald-500">{entry.id}</span>
                                                <p className={`mt-1 text-[10px] font-bold uppercase tracking-tighter ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                                                    {new Date(entry.date).toLocaleDateString("en-IN")}
                                                </p>
                                            </td>
                                            <td className="px-8 py-6">
                                                <span className={`text-xs font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{entry.type}</span>
                                            </td>
                                            <td className="px-8 py-6">
                                                <span className={`text-sm font-medium ${isDark ? "text-slate-400" : "text-slate-600"}`}>{entry.source}</span>
                                            </td>
                                            <td className="px-8 py-6 text-right">
                                                <div className="flex flex-col items-end">
                                                    <span className={`text-sm font-black ${isDark ? "text-white" : "text-slate-900"}`}>{entry.detail}</span>
                                                    <span className="mt-1 rounded-full bg-emerald-500/10 px-3 py-0.5 text-[10px] font-black uppercase text-emerald-500">
                                                        {entry.badge}
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {activityRows.length === 0 && (
                            <div className={`px-8 py-10 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                                No live insurance or treatment-linked activity is available yet. Once your visits, prescriptions, or record access events are logged, they will appear here automatically.
                            </div>
                        )}
                    </div>
                </section>

                <section className="xl:col-span-4">
                    <h2 className="mb-6 flex items-center gap-3 text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                        <span className="h-[1px] w-8 bg-slate-500/30"></span>
                        Profile Health Snapshot
                    </h2>

                    <div className="space-y-6">
                        <SnapshotCard label="Allergies" value={patientInfo?.allergies?.length || 0} isDark={isDark} />
                        <SnapshotCard label="Surgeries" value={patientInfo?.surgeries?.length || 0} isDark={isDark} />
                        <SnapshotCard label="Age" value={patientInfo?.age || "N/A"} isDark={isDark} />
                        <SnapshotCard label="Blood Group" value={patientInfo?.bloodGroup || "N/A"} isDark={isDark} />
                    </div>
                </section>
            </div>
        </div>
    );
}

function SchemeCard({ scheme, isDark }) {
    return (
        <div className={`group flex flex-col justify-between rounded-[2.5rem] border p-8 shadow-2xl transition-all duration-500 hover:border-emerald-500/40 ${isDark ? "border-slate-800 bg-[#111827]" : "border-slate-200 bg-white"} ${scheme.isGov ? "border-emerald-500/10" : ""}`}>
            <div>
                <div className="mb-6 flex items-start justify-between">
                    <h3 className={`text-xl font-bold tracking-tight transition-colors group-hover:text-emerald-500 ${isDark ? "text-white" : "text-slate-900"}`}>
                        {scheme.title}
                    </h3>
                    <div className="flex flex-col items-end gap-2">
                        {scheme.isGov && <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-500">Official TN</span>}
                        <EligibilityBadge isDark={isDark} />
                    </div>
                </div>
                <p className={`text-sm leading-relaxed ${isDark ? "text-slate-500" : "text-slate-500"}`}>
                    {scheme.description}
                </p>
                <p className={`mt-3 text-xs ${isDark ? "text-slate-600" : "text-slate-400"}`}>
                    Check the official portal for up-to-date scheme criteria and document requirements.
                </p>
            </div>

            <div className="mt-10">
                <a
                    href={scheme.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex w-full items-center justify-center gap-3 rounded-2xl px-6 py-4 text-xs font-black uppercase tracking-widest shadow-lg transition-all active:scale-95 ${isDark ? "bg-slate-800 text-white hover:bg-emerald-600" : "bg-slate-100 text-slate-900 hover:bg-emerald-600"}`}
                >
                    Verify eligibility
                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                </a>
            </div>
        </div>
    );
}

function SnapshotCard({ label, value, isDark }) {
    return (
        <div className={`rounded-3xl border p-6 transition-all ${isDark ? "border-slate-800 bg-[#0f172a]" : "border-slate-200 bg-white"}`}>
            <p className={`text-[10px] font-black uppercase tracking-widest ${isDark ? "text-slate-500" : "text-slate-400"}`}>{label}</p>
            <p className={`mt-3 text-3xl font-black tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>{value}</p>
        </div>
    );
}

function EligibilityBadge({ isDark }) {
    return (
        <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${isDark ? "border-slate-700 bg-slate-800/50 text-slate-300" : "border-slate-200 bg-slate-100 text-slate-500"}`}>
            <span className="size-1.5 rounded-full bg-slate-500"></span>
            Official Portal
        </div>
    );
}
