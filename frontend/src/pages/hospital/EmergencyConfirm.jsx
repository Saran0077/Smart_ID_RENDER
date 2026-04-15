import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../../context/SessionContext";
import { useEmergency } from "../../context/EmergencyContext";
import hospitalAPI from "../../services/management.api";

export default function EmergencyConfirm() {
    const navigate = useNavigate();
    const { patient } = useSession();
    const { setEmergencySession, resetEmergency } = useEmergency();
    const [password, setPassword] = useState("");
    const [isVerifying, setIsVerifying] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!patient) {
            navigate("/hospital");
        }
    }, [patient, navigate]);

    const handleConfirm = async (e) => {
        if (e) e.preventDefault();
        setIsVerifying(true);
        setError(null);

        try {
            const res = await hospitalAPI.authenticateEmergencyManager({ password });

            if (res.allowed || res.authorized) {
                setEmergencySession({
                    active: true,
                    by: res.user || { id: "admin_01", name: "Institutional Admin", role: "ADMIN" },
                    startedAt: Date.now()
                });
                navigate("/hospital/emergency/nfc-scan");
            } else {
                setError("Unauthorized. Admin or Manager role required.");
            }
        } catch (err) {
            setError(err.response?.data?.message || "Verification failed. Access Denied.");
        } finally {
            setIsVerifying(false);
        }
    };

    if (!patient) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-red-950/40 backdrop-blur-xl p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[2.5rem] shadow-2xl border border-red-200 dark:border-red-900/40 overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="p-10 text-center bg-red-50/50 dark:bg-red-900/20">
                    <div className="mx-auto size-20 bg-red-600 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-red-600/20 rotate-12">
                        <span className="material-symbols-outlined text-white text-4xl">lock_open</span>
                    </div>
                    <h2 className="text-3xl font-bold text-slate-800 dark:text-white">Confirm Bypass</h2>
                    <p className="text-red-600 dark:text-red-400 font-bold text-xs uppercase tracking-widest mt-2">Manager Authorization Required</p>
                </div>

                <form onSubmit={handleConfirm} className="p-10 space-y-8">
                    <div className="p-5 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800 rounded-2xl flex items-start gap-4">
                        <span className="material-symbols-outlined text-red-500 text-2xl">warning</span>
                        <p className="text-sm text-red-800 dark:text-red-300 font-medium leading-relaxed">
                            This action bypasses patient consent protocols. Institutional authority will be logged as the identity source for this EMR entry.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Institutional Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-6 py-5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-[1.25rem] focus:border-red-500 outline-none transition-all font-semibold text-lg"
                            placeholder="••••••••"
                            required
                            autoFocus
                        />
                    </div>

                    {error && <p className="text-red-500 text-sm font-bold text-center bg-red-50 dark:bg-red-900/10 py-3 rounded-xl animate-shake">{error}</p>}

                    <div className="flex flex-col gap-4 pt-2">
                        <button
                            type="submit"
                            disabled={isVerifying || !password}
                            className="w-full py-5 bg-red-600 hover:bg-red-700 text-white font-bold text-xl rounded-[1.25rem] transition-all shadow-xl shadow-red-600/30 flex items-center justify-center gap-3 disabled:opacity-50"
                        >
                            <span className="material-symbols-outlined">gavel</span>
                            {isVerifying ? "Verifying..." : "Confirm Override"}
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                resetEmergency();
                                navigate("/hospital");
                            }}
                            className="w-full py-4 text-slate-400 font-bold hover:text-slate-600 transition-all text-sm uppercase tracking-widest"
                        >
                            Cancel & Return
                        </button>
                    </div>
                </form>
            </div>

            <style>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
                .animate-shake { animation: shake 0.2s ease-in-out 0s 2; }
            `}</style>
        </div>
    );
}
