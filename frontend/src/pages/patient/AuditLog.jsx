import { useEffect, useState } from "react";
import patientApi from "../../services/patient.api";

export default function AuditLog() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        patientApi.getPatientAuditLog()
            .then(res => {
                setLogs(res);
                setError(null);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to load audit log:", err);
                setLogs([]);
                setError("Unable to load your audit history right now.");
                setLoading(false);
            });
    }, []);

    if (loading) return (
        <div className="flex items-center justify-center p-20">
            <div className="animate-spin size-8 border-4 border-emerald-600 border-t-transparent rounded-full"></div>
        </div>
    );

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800 dark:text-emerald-50">Audit Transparency</h1>
                    <p className="text-sm text-slate-500 mt-2">Every access to your medical information is immutably logged below.</p>
                </div>
                <div className="size-12 bg-slate-100 dark:bg-slate-900 rounded-2xl flex items-center justify-center text-slate-400">
                    <span className="material-symbols-outlined">security</span>
                </div>
            </div>

            <div className="bg-white dark:bg-[#11221f] rounded-[2rem] border border-slate-200 dark:border-emerald-900/40 overflow-hidden shadow-xl shadow-slate-200/50 dark:shadow-none">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 dark:border-emerald-900/20 bg-slate-50/50 dark:bg-emerald-900/10">
                                <th className="p-5 text-left font-bold text-slate-400 dark:text-emerald-200/40 uppercase tracking-widest text-[10px]">Timestamp</th>
                                <th className="p-5 text-left font-bold text-slate-400 dark:text-emerald-200/40 uppercase tracking-widest text-[10px]">Staff / Entity</th>
                                <th className="p-5 text-left font-bold text-slate-400 dark:text-emerald-200/40 uppercase tracking-widest text-[10px]">Operation</th>
                                <th className="p-5 text-left font-bold text-slate-400 dark:text-emerald-200/40 uppercase tracking-widest text-[10px]">Verification</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-emerald-900/10">
                            {logs.map((log, i) => (
                                <tr
                                    key={i}
                                    className={`transition-colors hover:bg-slate-50 dark:hover:bg-emerald-900/5 ${log.isEmergency || /EMERGENCY/i.test(log.action) ? "bg-red-50/50 dark:bg-red-900/10" : ""}`}
                                >
                                    <td className="p-5 font-mono text-xs text-slate-500 dark:text-emerald-200/60 leading-none">{log.timestamp ? new Date(log.timestamp).toLocaleString() : "-"}</td>
                                    <td className="p-5">
                                        <div className="flex items-center gap-3">
                                            <div className={`size-8 rounded-lg flex items-center justify-center ${log.isEmergency || /EMERGENCY/i.test(log.action) ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                                <span className="material-symbols-outlined text-sm">{log.isEmergency || /EMERGENCY/i.test(log.action) ? 'warning' : 'person'}</span>
                                            </div>
                                            <span className="font-bold text-slate-700 dark:text-emerald-50">{log.actorName}</span>
                                        </div>
                                    </td>
                                    <td className="p-5">
                                        <div className="space-y-1">
                                            <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-md text-[10px] font-bold text-slate-600 dark:text-emerald-200/60 uppercase">
                                                {log.action}
                                            </span>
                                            {log.targetName && (
                                                <div className="text-xs text-slate-500 dark:text-emerald-200/60">{log.targetName}</div>
                                            )}
                                            {log.reason && (
                                                <div className="text-xs text-rose-500">{log.reason}</div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-5">
                                        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black tracking-tight ${log.outcome === 'FAILED' || log.outcome === 'DENIED'
                                                ? "bg-red-100 text-red-700 border border-red-200"
                                                : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                            }`}>
                                            <span className="material-symbols-outlined text-[10px]">
                                                {log.outcome === 'FAILED' || log.outcome === 'DENIED' ? 'error' : 'verified_user'}
                                            </span>
                                            {log.outcome || 'SUCCESS'}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {!loading && logs.length === 0 && (
                    <div className="p-8 text-center text-slate-500">{error || 'No audit records available yet.'}</div>
                )}
            </div>

            <div className="p-6 bg-emerald-50 content-[''] dark:bg-emerald-900/10 rounded-2xl border border-emerald-100 dark:border-emerald-800 flex items-start gap-4">
                <span className="material-symbols-outlined text-emerald-600">info</span>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium leading-relaxed">
                    The records above are audit-backed. If you notice any unauthorized access, contact your hospital administrator or support team immediately.
                </p>
            </div>
        </div>
    );
}
