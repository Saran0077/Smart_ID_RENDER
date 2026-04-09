import { useEffect, useState } from "react";
import patientApi from "../../services/patient.api";
import toast from "react-hot-toast";

export default function Dashboard() {
    const [emr, setEmr] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        patientApi.getPatientEMR()
            .then((res) => {
                setEmr(res);
                setLoading(false);
            })
            .catch((err) => {
                console.error("Failed to load EMR:", err);
                setError("Unable to load medical records. Please try again.");
                setLoading(false);
            });
    }, []);

    const downloadPDF = async (type) => {
        setExporting(true);
        try {
            const blob = type === "profile"
                ? await patientApi.exportProfilePDF()
                : await patientApi.exportMedicalHistoryPDF();

            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = type === "profile" ? "smart-id-profile.pdf" : "smart-id-medical-history.pdf";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success("PDF downloaded successfully");
        } catch (err) {
            console.error("PDF export failed:", err);
            toast.error("Failed to export PDF. Please try again.");
        } finally {
            setExporting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-20">
                <div className="size-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center p-20">
                <div className="text-center">
                    <span className="material-symbols-outlined mb-4 text-6xl text-red-500">error</span>
                    <p className="font-medium text-slate-500">{error}</p>
                </div>
            </div>
        );
    }

    const patient = emr?.patient || null;
    const visits = emr?.visits || [];

    return (
        <div className="animate-in space-y-8 fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800 dark:text-emerald-50">Medical History</h1>
                    {patient && (
                        <p className="mt-2 text-sm text-slate-500 dark:text-emerald-200/50">
                            {patient.fullName} | {patient.phone} | Blood Group {patient.bloodGroup || "N/A"}
                        </p>
                    )}
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => downloadPDF("profile")}
                        disabled={exporting}
                        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50 disabled:opacity-50 dark:border-emerald-900/40 dark:bg-slate-900 dark:text-emerald-200/60"
                    >
                        <span className="material-symbols-outlined text-sm">badge</span>
                        Profile PDF
                    </button>
                    <button
                        onClick={() => downloadPDF("history")}
                        disabled={exporting}
                        className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition-all hover:bg-emerald-500 disabled:opacity-50"
                    >
                        <span className="material-symbols-outlined text-sm">download</span>
                        {exporting ? "Exporting..." : "Export History PDF"}
                    </button>
                </div>
            </div>

            {patient && (
                <div className="grid gap-4 md:grid-cols-4">
                    <SummaryCard label="Age" value={patient.age || "N/A"} icon="cake" />
                    <SummaryCard label="Gender" value={patient.gender || "N/A"} icon="wc" />
                    <SummaryCard label="Allergies" value={patient.allergies?.length || 0} icon="allergy" />
                    <SummaryCard label="Surgeries" value={patient.surgeries?.length || 0} icon="surgical" />
                </div>
            )}

            {visits.length === 0 ? (
                <div className="py-20 text-center text-slate-500">
                    <span className="material-symbols-outlined mb-4 text-6xl">folder_open</span>
                    <p className="font-medium">No medical records found</p>
                    <p className="mt-2 text-sm">Your medical history will appear here after your first visit.</p>
                </div>
            ) : (
                <div className="grid gap-6">
                    {visits.map((visit, idx) => (
                        <div
                            key={`${visit.date || "record"}-${idx}`}
                            className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-emerald-500/50 dark:border-emerald-900/30 dark:bg-[#11221f]"
                        >
                            <div className="mb-4 flex items-start justify-between gap-4">
                                <div>
                                    <h3 className="text-xl font-bold text-slate-800 dark:text-emerald-50">{visit.hospital}</h3>
                                    <p className="text-sm font-medium text-slate-500 dark:text-emerald-200/40">
                                        {visit.doctor} | {visit.date ? new Date(visit.date).toLocaleDateString() : "N/A"}
                                    </p>
                                    <div className="mt-2">
                                        <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                                            visit.source === "doctor_portal"
                                                ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300"
                                                : "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300"
                                        }`}>
                                            {visit.sourceLabel || "Care team"}
                                        </span>
                                    </div>
                                </div>
                                <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${visit.category === "Illness" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>
                                    {visit.category || "Visit"}
                                </span>
                            </div>
                            <p className="rounded-xl bg-slate-50 p-4 leading-relaxed text-slate-600 dark:bg-slate-900/40 dark:text-emerald-100/80">
                                {visit.summary}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function SummaryCard({ label, value, icon }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-emerald-900/30 dark:bg-[#11221f]">
            <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-slate-900 dark:text-emerald-300">
                <span className="material-symbols-outlined text-base">{icon}</span>
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-emerald-200/40">{label}</p>
            <p className="mt-2 text-xl font-bold text-slate-800 dark:text-emerald-50">{value}</p>
        </div>
    );
}
