import { useState } from "react";
import toast from "react-hot-toast";
import medicalShopApi from "../../services/medicalShop.api";

export default function MedicalShopDashboard() {
    const [patient, setPatient] = useState(null);
    const [loading, setLoading] = useState(false);
    const [uid, setUid] = useState("");
    const [error, setError] = useState("");
    const [dispensing, setDispensing] = useState(false);
    const [dispensedIds, setDispensedIds] = useState(new Set());
    const [printingPrescription, setPrintingPrescription] = useState(null);
    const [viewingPrescription, setViewingPrescription] = useState(null);

    const loadPatientByUid = async (nextUid) => {
        const normalizedUid = nextUid.trim();

        if (!normalizedUid) {
            setError("Enter or scan an NFC UID first.");
            return;
        }

        setLoading(true);
        setError("");
        try {
            const data = await medicalShopApi.scanNFC(normalizedUid);
            setUid(normalizedUid);
            if (data && data.patient) {
                setPatient({
                    ...data.patient,
                    name: data.patient.fullName || data.patient.name || "Unknown Patient",
                    prescriptions: data.patient.prescriptions || []
                });
            }
        } catch (err) {
            console.error("Scan error:", err);
            setPatient(null);
            setError(err.response?.data?.message || "NFC Scan Failed. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleScan = async () => {
        await loadPatientByUid(uid);
    };

    const handleHardwareTap = async () => {
        setLoading(true);
        setError("");
        setPatient(null);

        try {
            const scanData = await medicalShopApi.scanHardwareNfc();
            const scannedUid = scanData?.uid || scanData?.patient?.nfcId || scanData?.patient?.nfcUuid;

            if (!scannedUid) {
                throw new Error("No NFC UID was returned by the hardware reader.");
            }

            setUid(scannedUid);
            const patientData = await medicalShopApi.scanNFC(scannedUid);

            if (patientData?.patient) {
                setPatient({
                    ...patientData.patient,
                    name: patientData.patient.fullName || patientData.patient.name || "Unknown Patient",
                    prescriptions: patientData.patient.prescriptions || []
                });
            }
        } catch (err) {
            console.error("Hardware scan error:", err);
            setError(err.response?.data?.message || err.message || "Hardware scan failed. You can still enter the UID manually.");
        } finally {
            setLoading(false);
        }
    };

    const handleViewPDF = async (prescription) => {
        if (!prescription?.id) {
            toast.error("Prescription ID not found");
            return;
        }

        setViewingPrescription(prescription.id);
        try {
            const pdfBlob = await medicalShopApi.fetchPrescriptionPDF(prescription.id);
            const url = URL.createObjectURL(pdfBlob);
            const viewerWindow = window.open(url, "_blank", "noopener,noreferrer");

            if (!viewerWindow) {
                URL.revokeObjectURL(url);
                toast.error("Please allow popups to view the prescription PDF");
                return;
            }

            const revokeUrl = () => {
                URL.revokeObjectURL(url);
            };

            viewerWindow.addEventListener("beforeunload", revokeUrl, { once: true });
            setTimeout(revokeUrl, 60000);
        } catch (err) {
            console.error("View PDF error:", err);
            toast.error(err.response?.data?.message || "Failed to open prescription PDF");
        } finally {
            setViewingPrescription(null);
        }
    };

    const handleMarkAsDispensed = async (prescriptionId) => {
        if (!prescriptionId) {
            toast.error("Prescription ID not found");
            return;
        }

        if (dispensedIds.has(prescriptionId)) {
            toast.success("Already marked as dispensed");
            return;
        }

        setDispensing(true);
        try {
            await medicalShopApi.markAsDispensed(prescriptionId, patient.id);
            setDispensedIds(prev => new Set([...prev, prescriptionId]));
            toast.success("Prescription marked as dispensed");
        } catch (err) {
            console.error("Dispense error:", err);
            toast.error(err.response?.data?.message || "Failed to mark as dispensed");
        } finally {
            setDispensing(false);
        }
    };

    const handleMarkAllAsDispensed = async () => {
        if (!patient?.prescriptions?.length) return;

        setDispensing(true);
        const undispensed = patient.prescriptions.filter(p => !dispensedIds.has(p.id));

        try {
            for (const prescription of undispensed) {
                try {
                    await medicalShopApi.markAsDispensed(prescription.id, patient.id);
                    setDispensedIds(prev => new Set([...prev, prescription.id]));
                } catch (err) {
                    console.error(`Failed to dispense ${prescription.id}:`, err);
                }
            }
            toast.success("All prescriptions marked as dispensed");
        } catch (err) {
            console.error("Batch dispense error:", err);
            toast.error("Some prescriptions failed to mark as dispensed");
        } finally {
            setDispensing(false);
        }
    };

    const handlePrint = async (prescription) => {
        if (!prescription?.id) {
            toast.error("Prescription not found");
            return;
        }

        setPrintingPrescription(prescription.id);
        try {
            const pdfBlob = await medicalShopApi.fetchPrescriptionPDF(prescription.id);
            const url = URL.createObjectURL(pdfBlob);
            const printWindow = window.open(url, "_blank", "noopener,noreferrer");
            if (printWindow) {
                printWindow.onload = () => {
                    printWindow.print();
                    URL.revokeObjectURL(url);
                };
            } else {
                toast.error("Please allow popups to print");
            }
        } catch (err) {
            console.error("Print error:", err);
            toast.error(err.response?.data?.message || "Failed to load prescription for printing");
        } finally {
            setPrintingPrescription(null);
        }
    };

        return (
        <div className="max-w-4xl mx-auto px-6">
            <div className="text-center mb-12">
                <h1 className="text-4xl font-light text-slate-900 dark:text-white mb-3">
                    Welcome back, <span className="font-bold">Pharmacist</span>
                </h1>
                <p className="text-slate-500 font-medium">
                    Securely verify prescriptions by tapping the patient's Smart ID.
                </p>
            </div>

            {/* NFC SCAN SURFACE */}
            {!patient && (
                <div className="mx-auto max-w-sm bg-white dark:bg-slate-900 rounded-[3rem] p-8 shadow-2xl shadow-primary/5 border border-slate-100 dark:border-slate-800 overflow-hidden">
                    <button
                        type="button"
                        onClick={handleHardwareTap}
                        disabled={loading}
                        className="relative mb-6 flex aspect-square w-full flex-col items-center justify-center overflow-hidden rounded-[2rem] border border-dashed border-slate-200 bg-slate-50/60 text-center transition-all hover:border-primary/40 hover:bg-slate-100/80 disabled:cursor-not-allowed disabled:opacity-80 dark:border-slate-700 dark:bg-slate-950/60 dark:hover:bg-slate-900"
                    >
                        <div className="absolute inset-0 bg-primary/5 scale-0 hover:scale-100 transition-transform duration-700 rounded-full"></div>
                        <div className="relative w-28 h-28 rounded-full bg-primary/10 flex items-center justify-center mb-8">
                            <span className="material-symbols-outlined text-primary text-6xl animate-pulse">
                                contactless
                            </span>
                        </div>

                        <h2 className="relative text-2xl font-bold text-slate-900 dark:text-white">Scan Patient Card</h2>
                        <p className="relative text-slate-500 mt-2 font-medium px-6">
                            Tap here to read from the live hardware reader and load prescriptions instantly.
                        </p>

                        {loading && (
                            <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex items-center justify-center">
                                <div className="flex flex-col items-center gap-4">
                                    <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                                    <span className="font-bold text-primary animate-pulse">Scanning Securely...</span>
                                </div>
                            </div>
                        )}
                    </button>

                    <div className="space-y-4">
                        <label className="block text-[10px] uppercase tracking-widest text-slate-400 font-bold">NFC UID</label>
                        <input
                            type="text"
                            value={uid}
                            onChange={(event) => setUid(event.target.value)}
                            placeholder="Enter scanned card UID"
                            className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-primary transition-all"
                        />
                        <button
                            onClick={handleScan}
                            disabled={loading}
                            className="w-full bg-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.01] transition-all disabled:opacity-60"
                        >
                            {loading ? "Scanning..." : "Load Patient Prescriptions"}
                        </button>
                        {error && (
                            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/30 dark:bg-red-950/30 dark:text-red-300">
                                {error}
                            </div>
                        )}
                        <p className="text-xs text-slate-400 font-medium text-center">
                            Tip: tap above for immediate hardware scan, or enter the UID here manually.
                        </p>
                    </div>
                </div>
            )}

            {/* PATIENT PRESCRIPTION VIEW (HIPAA LIMITED) */}
            {patient && (
                <div className="animate-in fade-in slide-in-from-bottom-8 duration-500">
                    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] overflow-hidden border border-slate-100 dark:border-slate-800 shadow-2xl">
                        <div className="bg-primary p-8 text-white flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center">
                                    <span className="material-symbols-outlined text-3xl">patient_list</span>
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold leading-tight">{patient.name}</h2>
                                    <span className="text-white/80 text-sm font-medium">Verified Patient Session</span>
                                </div>
                            </div>
                            <button
                                onClick={() => setPatient(null)}
                                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="p-8">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-10">
                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold block">Patient Age</label>
                                    <p className="text-lg font-bold text-slate-900 dark:text-white">{patient.age || "N/A"} Years</p>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold block">Gender</label>
                                    <p className="text-lg font-bold text-slate-900 dark:text-white">{patient.gender || "N/A"}</p>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold block">Contact</label>
                                    <p className="text-lg font-bold text-slate-900 dark:text-white">{patient.phone || "N/A"}</p>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold block">Status</label>
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-600 dark:bg-green-900/10 dark:text-green-500 rounded-full text-xs font-bold">
                                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                                        Active Prescription
                                    </span>
                                </div>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-3xl p-8 border border-slate-100 dark:border-slate-800">
                                <div className="flex items-center gap-3 mb-6">
                                    <span className="material-symbols-outlined text-primary">prescriptions</span>
                                    <h4 className="text-xl font-bold text-slate-900 dark:text-white">Active Prescriptions</h4>
                                </div>

                                <div className="space-y-3">
                                    {patient.prescriptions && patient.prescriptions.map((p, i) => (
                                        <div key={p.id || i} className="flex items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm group hover:border-primary/30 transition-all">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-all">
                                                    <span className="material-symbols-outlined text-xl">pill</span>
                                                </div>
                                                <div>
                                                    <span className="font-bold text-slate-700 dark:text-slate-200 block">{p.name || p}</span>
                                                    <div className="mt-1 flex flex-wrap items-center gap-2">
                                                        <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest ${
                                                            p.source === "doctor_portal"
                                                                ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300"
                                                                : "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300"
                                                        }`}>
                                                            {p.sourceLabel || "Care team"}
                                                        </span>
                                                        {p.doctor && (
                                                            <span className="text-[11px] font-semibold text-slate-500">
                                                                {p.doctor}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {p.notes && (
                                                        <span className="text-xs text-slate-500">{p.notes}</span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {dispensedIds.has(p.id) ? (
                                                    <span className="flex items-center gap-1.5 text-xs font-bold text-green-600 px-3 py-1.5">
                                                        <span className="material-symbols-outlined !text-sm">check_circle</span>
                                                        Dispensed
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={() => handleMarkAsDispensed(p.id)}
                                                        disabled={dispensing}
                                                        className="flex items-center gap-1.5 text-xs font-bold text-green-600 hover:bg-green-50 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                                                        title="Mark as Dispensed"
                                                    >
                                                        <span className="material-symbols-outlined !text-sm">check</span>
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handlePrint(p)}
                                                    disabled={printingPrescription === p.id}
                                                    className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-primary hover:bg-primary/5 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                                                    title="Print Prescription"
                                                >
                                                    {printingPrescription === p.id ? (
                                                        <span className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin"></span>
                                                    ) : (
                                                        <span className="material-symbols-outlined !text-sm">print</span>
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() => handleViewPDF(p)}
                                                    disabled={viewingPrescription === p.id}
                                                    className="flex items-center gap-1.5 text-xs font-bold text-primary hover:bg-primary/5 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                                                    title="View PDF"
                                                >
                                                    {viewingPrescription === p.id ? (
                                                        <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></span>
                                                    ) : (
                                                        <span className="material-symbols-outlined !text-sm">open_in_new</span>
                                                    )}
                                                    VIEW
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-8 flex gap-4">
                                    <button
                                        onClick={handleMarkAllAsDispensed}
                                        disabled={dispensing || patient.prescriptions?.every(p => dispensedIds.has(p.id))}
                                        className="flex-1 bg-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.01] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        {dispensing ? (
                                            <span className="flex items-center justify-center gap-2">
                                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                                Processing...
                                            </span>
                                        ) : patient.prescriptions?.every(p => dispensedIds.has(p.id)) ? (
                                            "All Dispensed"
                                        ) : (
                                            "Mark as Dispensed"
                                        )}
                                    </button>
                                    <button
                                        onClick={() => {
                                            const firstUndispensed = patient.prescriptions?.find(p => !dispensedIds.has(p.id));
                                            if (firstUndispensed) {
                                                handlePrint(firstUndispensed);
                                            } else {
                                                toast.success("All prescriptions printed");
                                            }
                                        }}
                                        disabled={printingPrescription !== null}
                                        className="px-6 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 py-4 rounded-2xl font-bold flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-all disabled:opacity-60"
                                    >
                                        {printingPrescription ? (
                                            <span className="w-5 h-5 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin"></span>
                                        ) : (
                                            <span className="material-symbols-outlined">print</span>
                                        )}
                                    </button>
                                </div>
                            </div>

                            <p className="mt-6 text-center text-xs text-slate-400 font-medium">
                                🔒 Privacy Guard: Diagnosis and medical history are hidden from this view.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
