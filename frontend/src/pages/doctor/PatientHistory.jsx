import { useEffect, useState } from "react";
import doctorApi from "../../services/doctor.api";

const formatHistoryRecord = (record) => {
    const patientName = record.patientName || record.targetName || "System";
    const date = record.timestamp || null;
    const summary = record.reason
        || record.resource
        || record.action?.replace(/_/g, " ")
        || "Recorded activity";

    return {
        id: record.id || `${patientName}-${date || "no-date"}`,
        patientName,
        date,
        summary,
        action: record.action || "ACTIVITY",
        actor: record.actorName || record.actorRole || "System",
        verification: record.outcome || "SUCCESS",
        resource: record.resource || "AUDIT",
    };
};

export default function PatientHistory() {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        doctorApi.getHistory()
            .then((data) => setRecords((data || []).map(formatHistoryRecord)))
            .catch(err => {
                console.error("Failed to load history", err);
                setRecords([]);
            })
            .finally(() => setLoading(false));
    }, []);

    const handleViewDetails = (record) => {
        setSelectedRecord(record);
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setSelectedRecord(null);
    };

    return (
        <div className="max-w-5xl mx-auto">
            <div className="mb-10">
                <h1 className="text-3xl font-bold mb-2">Access History</h1>
                <p className="text-slate-500">Verified audit events associated with your doctor account.</p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] overflow-hidden shadow-sm">
                {loading ? (
                    <div className="p-20 text-center text-slate-400">Loading records...</div>
                ) : (
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/50">
                                <th className="px-8 py-5 text-xs font-bold uppercase text-slate-400">Patient</th>
                                <th className="px-8 py-5 text-xs font-bold uppercase text-slate-400">Date</th>
                                <th className="px-8 py-5 text-xs font-bold uppercase text-slate-400">Activity / Summary</th>
                                <th className="px-8 py-5 text-xs font-bold uppercase text-slate-400 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y dark:divide-slate-800">
                            {records.map(r => (
                                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center text-slate-500 font-bold text-xs">
                                                {r.patientName?.split(' ').map(n => n?.[0]).join('') || '??'}
                                            </div>
                                            <span className="font-semibold">{r.patientName}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5 text-slate-500">{r.date ? new Date(r.date).toLocaleString() : "N/A"}</td>
                                    <td className="px-8 py-5">
                                        <div className="space-y-1">
                                            <p>{r.summary}</p>
                                            <p className="text-xs uppercase tracking-wider text-slate-400">{r.action.replace(/_/g, " ")}</p>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5 text-right">
                                        <button
                                            onClick={() => handleViewDetails(r)}
                                            className="text-primary font-bold text-sm hover:underline opacity-0 group-hover:opacity-100 transition-all"
                                        >
                                            View Details
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {!loading && records.length === 0 && (
                    <div className="p-20 text-center text-slate-500">No audit records found for your account.</div>
                )}
            </div>

            {showModal && selectedRecord && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white">Audit Details</h3>
                            <button
                                onClick={closeModal}
                                className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                            >
                                <span className="material-symbols-outlined text-slate-500">close</span>
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-xl">
                                    {selectedRecord.patientName?.split(' ').map(n => n?.[0]).join('') || '??'}
                                </div>
                                <div>
                                    <h4 className="text-lg font-bold text-slate-800 dark:text-white">{selectedRecord.patientName}</h4>
                                    <p className="text-sm text-slate-500">{selectedRecord.date ? new Date(selectedRecord.date).toLocaleString() : "N/A"}</p>
                                </div>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Activity Summary</p>
                                <p className="text-slate-700 dark:text-slate-300">{selectedRecord.summary}</p>
                            </div>
                            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 border border-blue-100 dark:border-blue-800 space-y-2">
                                <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Verification Context</p>
                                <p className="text-sm"><span className="text-slate-500">Action:</span> {selectedRecord.action.replace(/_/g, " ")}</p>
                                <p className="text-sm"><span className="text-slate-500">Actor:</span> {selectedRecord.actor}</p>
                                <p className="text-sm"><span className="text-slate-500">Verification:</span> {selectedRecord.verification}</p>
                                <p className="text-sm"><span className="text-slate-500">Resource:</span> {selectedRecord.resource}</p>
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
                            <p className="text-xs text-slate-400 text-center">
                                This panel reflects audit data returned by the backend for your account.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
