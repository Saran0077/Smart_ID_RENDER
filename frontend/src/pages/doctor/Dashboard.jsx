import { useState, useEffect } from "react";
import doctorApi from "../../services/doctor.api";
import toast from "react-hot-toast";

export default function DoctorDashboard() {
    const [patient, setPatient] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [stats, setStats] = useState(null);
    const [recentPatients, setRecentPatients] = useState([]);
    const [noteForm, setNoteForm] = useState({ condition: "", content: "" });
    const [savingNote, setSavingNote] = useState(false);

    const [step, setStep] = useState('idle');
    const [scannedUid, setScannedUid] = useState(null);

    const [hardware, setHardware] = useState({
        nfc: "Checking...",
        fingerprint: "Checking...",
        gsm: "Checking...",
        pi: "Checking..."
    });

    const formatTimelineDate = (value) => {
        if (!value) return "Date not available";

        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return "Date not available";

        return parsed.toLocaleString();
    };

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const [status, statsResponse, recentResponse] = await Promise.all([
                    doctorApi.getDeviceStatus(),
                    doctorApi.getStats(),
                    doctorApi.getRecentPatients(),
                ]);
                
                // Normalize hardware status - handle both string and object responses
                const normalizeHardware = (value) => {
                    if (typeof value === 'string') return value;
                    if (typeof value === 'object' && value !== null) {
                        if (value.available === true) return 'Connected';
                        if (value.status === 'ready' || value.status === 'online') return 'Connected';
                        if (value.available === false) return 'Unavailable';
                        return 'Unknown';
                    }
                    return 'Unavailable';
                };

                const normalizePi = (value) => {
                    if (typeof value === 'string') return value === 'online' ? 'Online' : value;
                    if (typeof value === 'object' && value !== null) {
                        return value.pi || value.status === 'ready' ? 'Online' : 'Offline';
                    }
                    return 'Online';
                };

                setHardware({
                    nfc: normalizeHardware(status?.nfc),
                    fingerprint: normalizeHardware(status?.fingerprint),
                    gsm: normalizeHardware(status?.gsm),
                    pi: normalizePi(status?.pi)
                });
                setStats(statsResponse || null);
                setRecentPatients(recentResponse || []);
            } catch {
                setHardware({
                    nfc: "Unavailable",
                    fingerprint: "Unavailable",
                    gsm: "Unavailable",
                    pi: "Offline"
                });
            }
        };
        fetchStatus();
    }, []);

    const handleStartScan = async () => {
        setStep('scanning');
        setError(null);
        try {
            const data = await doctorApi.scanNfc();
            if (data && data.uid) {
                setScannedUid(data.uid);
                setStep('loading');
                const patientData = await doctorApi.getPatientByUid(data.uid);
                setPatient({
                    ...patientData,
                    name: patientData.fullName || patientData.name || "Unknown Patient",
                    healthId: patientData.user?.username || patientData.nfcUuid || patientData._id,
                });
                setStep('success');
            }
        } catch (err) {
            console.error("NFC Scan Failed", err);
            const status = err.response?.status;
            const message = err.response?.data?.message || "Failed to scan NFC card. Please try again.";
            
            if (status === 404) {
                setError("Patient not found. The NFC card is not registered in the system.");
            } else if (status === 500) {
                setError("Server error. Please try again or contact administrator.");
            } else if (status === 401 || status === 403) {
                setError("Authentication error. Please refresh and login again.");
            } else {
                setError(message);
            }
            setStep('idle');
        }
    };

    const resetSession = async () => {
        const activePatientId = patient?.id || patient?._id;

        if (activePatientId) {
            try {
                await doctorApi.closePatientSession(activePatientId);
            } catch (err) {
                console.error("Failed to log session close", err);
                toast.error(err.response?.data?.message || "Failed to record session close.");
            }
        }

        setStep('idle');
        setPatient(null);
        setScannedUid(null);
        setError(null);
        setNoteForm({ condition: "", content: "" });
    };

    const handleSaveNote = async (event) => {
        event.preventDefault();

        const activePatientId = patient?.id || patient?._id;
        if (!activePatientId) {
            toast.error("No active patient session found.");
            return;
        }

        if (!noteForm.condition.trim() || !noteForm.content.trim()) {
            toast.error("Please enter both prescription title and note.");
            return;
        }

        setSavingNote(true);
        try {
            const response = await doctorApi.createClinicalNote(activePatientId, {
                condition: noteForm.condition.trim(),
                content: noteForm.content.trim(),
                mode: "STANDARD",
                source: "doctor_portal"
            });

            if (response?.note) {
                setPatient((prev) => ({
                    ...prev,
                    medicalHistory: [response.note, ...(prev?.medicalHistory || [])]
                }));
            }

            setNoteForm({ condition: "", content: "" });
            toast.success("Doctor prescription saved successfully.");
        } catch (err) {
            console.error("Failed to save doctor note", err);
            toast.error(err.response?.data?.message || "Failed to save doctor prescription.");
        } finally {
            setSavingNote(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto px-4 pb-20">
            <div className="mb-8 bg-slate-100 dark:bg-slate-900 p-6 rounded-[2rem] border dark:border-slate-800 shadow-sm">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Hardware Status</h3>
                <div className="flex flex-wrap gap-4 md:gap-8 text-sm font-bold">
                    <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${hardware.nfc === 'Connected' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                        NFC Reader: <span className="text-slate-500">{hardware.nfc}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${hardware.pi === 'Online' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                        Raspberry Pi: <span className="text-slate-500">{hardware.pi}</span>
                    </div>
                </div>
            </div>

            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    <MetricCard label="Patients" value={stats.totalPatients} />
                    <MetricCard label="Today" value={stats.todayConsultations} />
                    <MetricCard label="Pending Consents" value={stats.pendingConsents} />
                    <MetricCard label="Emergency" value={stats.emergencyAccessToday} />
                </div>
            )}

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
                <div>
                    <h1 className="text-4xl font-black tracking-tight mb-2">Doctor Portal</h1>
                    <p className="text-slate-500 font-medium">Tap NFC card to review records and write patient prescriptions</p>
                </div>
            </div>

            {!patient ? (
                <div className="bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-200 dark:border-slate-800 shadow-xl p-10 flex flex-col items-center justify-center text-center overflow-hidden min-h-[400px]">
                    {step === 'idle' && (
                        <div className="flex flex-col items-center animate-in fade-in duration-500">
                            <button
                                onClick={handleStartScan}
                                className="w-24 h-24 rounded-full flex items-center justify-center mb-6 transition-all hover:scale-105 bg-primary/10 text-primary hover:bg-primary hover:text-white"
                            >
                                <span className="material-symbols-outlined text-5xl">contactless</span>
                            </button>
                            <h2 className="text-2xl font-bold mb-2">Tap Patient Smart-ID</h2>
                            <p className="text-slate-500 font-medium max-w-sm mb-6">
                                Hold the NFC card near the reader to view patient records
                            </p>
                        </div>
                    )}

                    {step === 'scanning' && (
                        <div className="flex flex-col items-center animate-in fade-in duration-500">
                            <div className="w-24 h-24 rounded-full bg-primary text-white shadow-lg shadow-primary/40 animate-pulse flex items-center justify-center mb-6">
                                <span className="material-symbols-outlined text-5xl">contactless</span>
                            </div>
                            <h2 className="text-2xl font-bold mb-2">Scanning NFC...</h2>
                            <p className="text-slate-500 font-medium max-w-sm mb-6">
                                Waiting for Raspberry Pi NFC reader response
                            </p>
                            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    )}

                    {step === 'loading' && (
                        <div className="flex flex-col items-center animate-in fade-in duration-500">
                            <div className="w-24 h-24 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center mb-6 animate-pulse">
                                <span className="material-symbols-outlined text-5xl">person_search</span>
                            </div>
                            <h2 className="text-2xl font-bold mb-2">Loading Patient Data...</h2>
                            <p className="text-slate-500 font-medium max-w-sm mb-6">
                                Fetching records from database
                            </p>
                            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    )}

                    {step === 'idle' && error && (
                        <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl">
                            <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="animate-in fade-in slide-in-from-bottom-10 duration-700">
                    <div className="bg-white dark:bg-slate-900 rounded-[3rem] p-10 border border-slate-100 dark:border-slate-800 shadow-2xl overflow-hidden relative">
                        <div className="flex items-center gap-8 mb-12 pb-12 border-b dark:border-slate-800 mt-4">
                            <div className="w-20 h-20 rounded-[2rem] bg-primary flex items-center justify-center text-white font-black text-2xl shadow-lg">
                                {patient.name ? patient.name.split(' ').map(n => n[0]).join('') : "P"}
                            </div>
                            <div>
                                <h2 className="text-3xl font-black tracking-tight">{patient.name || "Unknown"}</h2>
                                <p className="text-slate-500 font-bold flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm">badge</span>
                                    Health ID: {patient.healthId || patient.id}
                                </p>
                                {patient.phone && (
                                    <p className="text-slate-400 text-sm">{patient.phone}</p>
                                )}
                            </div>
                            {patient.bloodGroup && (
                                <div className="ml-auto bg-red-50 dark:bg-red-900/20 px-6 py-3 rounded-2xl border border-red-100 dark:border-red-900/20 text-center">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-red-400 mb-1 leading-none">Blood Group</p>
                                    <p className="text-2xl font-black text-red-600 leading-none">{patient.bloodGroup}</p>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            <div className="space-y-6">
                                {patient.age && (
                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Age / Gender</label>
                                        <p className="text-xl font-bold bg-slate-50 dark:bg-slate-800 p-5 rounded-2xl border dark:border-slate-700">
                                            {patient.age} years / {patient.gender || "Not specified"}
                                        </p>
                                    </div>
                                )}
                                {patient.allergies && patient.allergies.length > 0 && (
                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-widest text-red-400 mb-2 block">Allergies</label>
                                        <div className="flex flex-wrap gap-2">
                                            {patient.allergies.map((allergy, i) => (
                                                <span key={i} className="px-3 py-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-full text-sm font-bold border border-red-200 dark:border-red-800">
                                                    {allergy}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {patient.emergencyContact && (
                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Emergency Contact</label>
                                        <p className="text-lg font-bold bg-slate-50 dark:bg-slate-800 p-5 rounded-2xl border dark:border-slate-700">
                                            {patient.emergencyContact.name} - {patient.emergencyContact.phone}
                                        </p>
                                    </div>
                                )}
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Doctor Prescription Note</label>
                                    <form onSubmit={handleSaveNote} className="space-y-3 rounded-[2rem] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-5">
                                        <input
                                            type="text"
                                            value={noteForm.condition}
                                            onChange={(event) => setNoteForm((prev) => ({ ...prev, condition: event.target.value }))}
                                            placeholder="Prescription title / condition"
                                            className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 outline-none focus:border-primary"
                                        />
                                        <textarea
                                            value={noteForm.content}
                                            onChange={(event) => setNoteForm((prev) => ({ ...prev, content: event.target.value }))}
                                            placeholder="Write the prescription or doctor note for the patient..."
                                            rows={5}
                                            className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 outline-none focus:border-primary"
                                        />
                                        <button
                                            type="submit"
                                            disabled={savingNote}
                                            className="w-full rounded-2xl bg-primary px-4 py-3 font-bold text-white transition-all hover:scale-[1.01] disabled:opacity-60"
                                        >
                                            {savingNote ? "Saving Prescription..." : "Save Doctor Prescription"}
                                        </button>
                                    </form>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="p-6 rounded-[2rem] border bg-green-50/50 border-green-200 dark:bg-green-950/20 dark:border-green-900/40">
                                    <h3 className="font-bold flex items-center gap-2 mb-4 text-green-600">
                                        <span className="material-symbols-outlined">verified_user</span>
                                        NFC Verified - Doctor Session Active
                                    </h3>
                                    <p className="text-xs text-slate-500 font-medium leading-relaxed">
                                        Patient identity verified via NFC card tap. You can now review history and save a doctor-authored prescription note.
                                    </p>
                                </div>
                                <div className="p-6 rounded-[2rem] border bg-blue-50/50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900/40">
                                    <h3 className="font-bold flex items-center gap-2 mb-4 text-blue-600">
                                        <span className="material-symbols-outlined">info</span>
                                        Data Source
                                    </h3>
                                    <p className="text-xs text-slate-500 font-medium leading-relaxed">
                                        Records synced from Smart-ID database. For detailed EMR access, patient consent is required.
                                    </p>
                                </div>
                                <button
                                    onClick={resetSession}
                                    className="w-full py-4 text-slate-400 font-bold hover:text-slate-900 dark:hover:text-white transition-all flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined">exit_to_app</span>
                                    Close Session
                                </button>
                            </div>
                        </div>

                        <div className="mt-10 pt-10 border-t border-slate-200 dark:border-slate-800">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-xl font-black tracking-tight">Clinical Records</h3>
                                    <p className="text-sm text-slate-500 font-medium">
                                        Historical medical notes available in view-only mode after NFC verification.
                                    </p>
                                </div>
                                <span className="text-xs font-black uppercase tracking-widest text-slate-400">
                                    {patient.medicalHistory?.length || 0} record(s)
                                </span>
                            </div>

                            {!patient.medicalHistory || patient.medicalHistory.length === 0 ? (
                                <div className="rounded-[2rem] border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-8 text-center">
                                    <p className="text-slate-500 font-medium">
                                        No clinical records are available for this patient yet.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {patient.medicalHistory
                                        .slice()
                                        .sort((left, right) => new Date(right.diagnosedDate || 0) - new Date(left.diagnosedDate || 0))
                                        .map((entry, index) => (
                                            <div
                                                key={`${entry.diagnosedDate || "record"}-${index}`}
                                                className="rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 p-6"
                                            >
                                                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                                                            Condition
                                                        </p>
                                                        <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                                                            {entry.condition || "Clinical note"}
                                                        </h4>
                                                        <div className="mt-2">
                                                            <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                                                                entry.source === "doctor_portal"
                                                                    ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300"
                                                                    : "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300"
                                                            }`}>
                                                                {entry.source === "doctor_portal" ? "Doctor" : "Hospital"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="text-left md:text-right">
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                                                            Recorded On
                                                        </p>
                                                        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                                                            {formatTimelineDate(entry.diagnosedDate)}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                                    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4">
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                                                            Doctor
                                                        </p>
                                                        <p className="font-semibold text-slate-700 dark:text-slate-200">
                                                            {entry.doctorName || "Not recorded"}
                                                        </p>
                                                    </div>
                                                    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4">
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                                                            Hospital
                                                        </p>
                                                        <p className="font-semibold text-slate-700 dark:text-slate-200">
                                                            {entry.hospitalName || "Hospital not recorded"}
                                                        </p>
                                                    </div>
                                                    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4">
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                                                            Recorded By
                                                        </p>
                                                        <p className="font-semibold text-slate-700 dark:text-slate-200 capitalize">
                                                            {entry.recordedByRole || "Care team"}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-5">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                                                        Notes
                                                    </p>
                                                    <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                                                        {entry.notes || "No additional notes recorded."}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {!patient && recentPatients.length > 0 && (
                <div className="mt-10 bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-slate-800 dark:text-slate-100">Recent Patients</h3>
                        <span className="text-xs text-slate-400 uppercase font-bold tracking-widest">Backend data</span>
                    </div>
                    <div className="space-y-3">
                        {recentPatients.slice(0, 5).map((entry) => (
                            <div key={entry.id} className="flex items-center justify-between rounded-2xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3">
                                <div>
                                    <p className="font-semibold">{entry.name}</p>
                                    <p className="text-sm text-slate-500">{entry.condition}</p>
                                </div>
                                <span className="text-xs font-mono text-slate-400">{new Date(entry.lastVisit).toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function MetricCard({ label, value }) {
    return (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">{label}</p>
            <p className="mt-2 text-2xl font-black">{value ?? 0}</p>
        </div>
    );
}
