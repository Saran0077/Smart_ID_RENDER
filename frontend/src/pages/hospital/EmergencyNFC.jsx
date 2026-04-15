import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useSession } from "../../context/SessionContext";
import { useEmergency } from "../../context/EmergencyContext";
import hospitalAPI from "../../services/management.api";

export default function EmergencyNFC() {
    const navigate = useNavigate();
    const { patient, setPatient } = useSession();
    const { emergency, resetEmergency } = useEmergency();
    const [scanState, setScanState] = useState("idle");
    const [hasStarted, setHasStarted] = useState(false);
    const [error, setError] = useState(null);
    const patientId = patient?.id || patient?._id;
    const expectedUid = `${patient?.nfcId || patient?.nfcUuid || patient?.nfc_uid || ""}`.trim();
    const isScanning = scanState === "scanning";
    const isVerified = scanState === "success";

    useEffect(() => {
        if (!emergency?.active) {
            navigate("/hospital");
        }
    }, [emergency?.active, navigate]);

    const handleEmergencyScan = useCallback(async () => {
        if (!patientId || !expectedUid) {
            const sessionError = "Emergency override requires an active patient session with a linked NFC card.";
            setError(sessionError);
            setScanState("error");
            toast.error(sessionError);
            return;
        }

        try {
            setScanState("scanning");
            setHasStarted(true);
            setError(null);
            const scan = await hospitalAPI.verifyEmergencyCard({
                patientId,
                expectedUid
            });

            if (!scan?.matched || !scan?.patient) {
                throw new Error(scan?.message || "Emergency NFC verification failed.");
            }

            const refreshedPatient = scan.patient;
            setPatient({
                ...refreshedPatient,
                name: refreshedPatient.name || refreshedPatient.fullName || patient.name,
                location: refreshedPatient.location || patient.location || "Hospital intake",
            });
            setScanState("success");
            toast.success("Patient card verified successfully");
            setTimeout(() => {
                navigate("/hospital/clinical-note");
            }, 1200);
        } catch (scanError) {
            console.error("Emergency NFC verification failed:", scanError);
            setError(scanError.response?.data?.message || scanError.message || "Emergency NFC verification failed.");
            setScanState("error");
        }
    }, [navigate, patient, patientId, setPatient, expectedUid]);

    useEffect(() => {
        if (!emergency?.active) return;
        if (hasStarted) return;
        if (!patientId || !expectedUid) return;

        handleEmergencyScan();
    }, [emergency?.active, hasStarted, patientId, expectedUid, handleEmergencyScan]);

    if (!patient || !emergency?.active) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-red-950/20 backdrop-blur-md p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-red-100 dark:border-red-900/30 overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="p-10 text-center">
                    <div 
                        className={`mx-auto size-24 bg-red-50 dark:bg-red-950 rounded-3xl flex items-center justify-center mb-8 border border-red-100 dark:border-red-800 relative ${isScanning ? 'animate-pulse' : ''}`}
                    >
                        <span className={`material-symbols-outlined text-6xl transition-all duration-500 ${isVerified ? 'text-emerald-500' : 'text-red-500'}`}>
                            contactless
                        </span>
                        {isScanning && (
                            <div className="absolute top-0 left-0 w-full h-1 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)] animate-scan-line rounded-full"></div>
                        )}
                    </div>

                    <h2 className="text-3xl font-bold text-slate-800 dark:text-white">Verify Patient Card</h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-3 text-lg">
                        Override authorized for <span className="text-red-600 font-bold">{patient.name}</span>.
                        <br />
                        <span className="text-sm font-medium">Please ensure the patient's Smart-ID card is in range to synchronize emergency records.</span>
                    </p>
                </div>

                <div className="px-10 pb-10">
                    {isVerified ? (
                        <div className="py-5 bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-500 rounded-2xl flex items-center justify-center gap-3 text-emerald-700 dark:text-emerald-400 font-bold animate-in fade-in zoom-in-95">
                            <span className="material-symbols-outlined">check_circle</span>
                            Card Verified. Accessing Records...
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-4">
                            <div className={`flex items-center gap-2 text-xs font-bold px-6 py-3 rounded-2xl ${isScanning ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}`}>
                                <div className={`size-2 rounded-full ${isScanning ? 'bg-red-500 animate-ping' : 'bg-amber-500'}`}></div>
                                {isScanning ? "Waiting for Hardware Tap" : error ? "Card Verification Failed" : "Ready to Scan"}
                            </div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                Place the physical card against the Raspberry Pi reader. A live card read is required for emergency access.
                            </p>
                            {error && <p className="text-sm font-bold text-red-500 text-center">{error}</p>}
                            <button
                                onClick={handleEmergencyScan}
                                disabled={isScanning}
                                className="px-5 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all disabled:opacity-60"
                            >
                                {isScanning ? "Scanning..." : hasStarted ? "Try Scan Again" : "Start Scan"}
                            </button>
                        </div>
                    )}

                    <button
                        onClick={() => {
                            resetEmergency();
                            navigate("/hospital");
                        }}
                        className="w-full mt-6 text-slate-400 font-bold hover:text-red-500 transition-all text-sm uppercase tracking-widest"
                    >
                        Cancel Override
                    </button>
                </div>

                <div className="bg-red-50 dark:bg-red-900/10 p-6 border-t border-red-100 dark:border-red-800 flex items-center gap-4">
                    <span className="material-symbols-outlined text-red-500">priority_high</span>
                    <p className="text-[11px] text-red-700 dark:text-red-300 font-bold uppercase tracking-wider leading-relaxed">
                        Emergency session will expire in 15 minutes. All writes must be completed within this window to maintain statutory compliance.
                    </p>
                </div>
            </div>

            <style>{`
        @keyframes scan-line {
          0% { top: 0; }
          100% { top: 100%; }
        }
        .animate-scan-line {
          animation: scan-line 2s linear infinite;
        }
      `}</style>
        </div>
    );
}
