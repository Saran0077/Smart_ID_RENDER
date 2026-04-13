import { useState, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useSession } from "../../context/SessionContext";
import hospitalAPI from "../../services/management.api";

const normalizeBiometricError = (err) => {
    const backendMessage = err?.response?.data?.message || err?.response?.data?.error;
    const fallbackMessage = err?.message || "Biometric sensor timeout or hardware error.";
    const rawMessage = backendMessage || fallbackMessage;

    if (typeof rawMessage === "string" && /<!doctype html>|<html[\s>]/i.test(rawMessage)) {
        return "Fingerprint verification service route was not found on the hardware bridge. Please check the Raspberry Pi server deployment.";
    }

    if (err?.response?.status === 404) {
        return "Fingerprint verification service is unavailable. Please verify the hardware bridge routes and try again.";
    }

    if (err?.response?.status === 408) {
        return "No finger detected. Place the patient's finger on the scanner and try again.";
    }

    return rawMessage;
};

export default function BiometricAuth() {
    const navigate = useNavigate();
    const { patient, otpVerified, authMethod, setFingerprintVerified } = useSession();
    const [isVerifying, setIsVerifying] = useState(false);
    const [error, setError] = useState(null);
    const [scanStatus, setScanStatus] = useState("PLACE_FINGER"); // PLACE_FINGER, SCANNING, SUCCESS, FAIL
    const activePatientId = patient?.id || patient?._id;

    useEffect(() => {
        if (!patient || !otpVerified || !authMethod) {
            navigate("/hospital");
            return;
        }

        if (authMethod !== "PATIENT") {
            navigate("/hospital/clinical-note");
        }
    }, [patient, otpVerified, authMethod, navigate]);

    const handleBiometricVerify = async () => {
        setIsVerifying(true);
        setError(null);
        setScanStatus("SCANNING");

        try {
            const res = await hospitalAPI.verifyBiometric({ patientId: activePatientId, authMethod: authMethod.toLowerCase() });

            if (res.success || res.verified) {
                setScanStatus("SUCCESS");
                setFingerprintVerified(true);
                setTimeout(() => {
                    navigate("/hospital/clinical-note");
                }, 1000);
            } else {
                setScanStatus("FAIL");
                setError("Biometric data mismatch. Please try again.");
            }
        } catch (err) {
            setScanStatus("FAIL");
            setError(normalizeBiometricError(err));
        } finally {
            setIsVerifying(false);
        }
    };

    if (!patient || !otpVerified || !authMethod || authMethod !== "PATIENT") return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-300">

                <div className="p-10 text-center">
                    <div className="mx-auto size-24 bg-slate-50 dark:bg-slate-950 rounded-3xl flex items-center justify-center mb-8 border border-slate-100 dark:border-slate-800 relative group">
                        {scanStatus === "SCANNING" ? (
                            <div className="absolute inset-0 bg-emerald-500/10 rounded-3xl animate-pulse"></div>
                        ) : null}

                        <span className={`material-symbols-outlined text-6xl transition-all duration-500 ${scanStatus === "SCANNING" ? "text-emerald-500 scale-110" :
                                scanStatus === "SUCCESS" ? "text-emerald-500" :
                                    scanStatus === "FAIL" ? "text-red-500" :
                                        "text-slate-300 dark:text-slate-700"
                            }`}>
                            fingerprint
                        </span>

                        {scanStatus === "SCANNING" && (
                            <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.8)] animate-scan-line rounded-full"></div>
                        )}
                    </div>

                    <h2 className="text-3xl font-bold text-slate-800 dark:text-white">Identity Assurance</h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-3 text-lg">
                        Please verify the patient's fingerprint to unlock clinical records.
                    </p>
                </div>

                <div className="px-10 pb-10 space-y-6">
                    <div className={`p-6 rounded-2xl border-2 transition-all flex items-center gap-4 ${scanStatus === "SUCCESS" ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800" :
                            scanStatus === "FAIL" ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" :
                                "bg-slate-50 dark:bg-slate-950 border-slate-100 dark:border-slate-800"
                        }`}>
                        <div className={`size-10 rounded-full flex items-center justify-center ${scanStatus === "SUCCESS" ? "bg-emerald-500 text-white" :
                                scanStatus === "FAIL" ? "bg-red-500 text-white" :
                                    "bg-slate-200 dark:bg-slate-800 text-slate-500"
                            }`}>
                            <span className="material-symbols-outlined text-xl">
                                {scanStatus === "SUCCESS" ? "check" : scanStatus === "FAIL" ? "close" : "sensors"}
                            </span>
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">Sensor Status</p>
                            <p className="text-sm text-slate-500">
                                {scanStatus === "PLACE_FINGER" && "Ready. Waiting for fingerprint..."}
                                {scanStatus === "SCANNING" && "Processing biometric data..."}
                                {scanStatus === "SUCCESS" && "Identity Verified."}
                                {scanStatus === "FAIL" && (error || "Verification failed.")}
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={handleBiometricVerify}
                            disabled={isVerifying || scanStatus === "SUCCESS"}
                            className="flex-1 py-5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg rounded-2xl transition-all shadow-xl shadow-emerald-600/20 flex items-center justify-center gap-3 disabled:opacity-50"
                        >
                            <span className="material-symbols-outlined">touch_app</span>
                            {isVerifying ? "Verifying..." : scanStatus === "FAIL" ? "Retry Verification" : "Scan Fingerprint"}
                        </button>
                    </div>

                    <button
                        onClick={() => navigate("/hospital")}
                        disabled={isVerifying}
                        className="w-full text-slate-400 font-bold hover:text-red-500 transition-all text-sm uppercase tracking-widest"
                    >
                        Cancel & Terminate Session
                    </button>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 p-6 border-t border-slate-100 dark:border-slate-800 flex items-center gap-4">
                    <span className="material-symbols-outlined text-amber-500">verified</span>
                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed italic">
                        Encryption Grade: AES-256. This biometric check is only required for patient self-consent. Raw fingerprint data is never stored; only cryptographic hashes are compared with the Smart-ID vault.
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
