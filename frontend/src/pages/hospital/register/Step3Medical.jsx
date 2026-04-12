import { useEffect, useState } from "react";
import { usePatientRegistration } from "../../../context/PatientRegistrationContext";
import hospitalAPI from "../../../services/management.api";
import { useNavigate } from "react-router-dom";

export default function Step3Medical() {
    const { data, updateSection, updateValue, markStepComplete, canAccessStep, getFirstIncompleteStepPath } = usePatientRegistration();
    const navigate = useNavigate();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLinkingCard, setIsLinkingCard] = useState(false);
    const [nfcStatus, setNfcStatus] = useState(data.nfcId ? "Linked" : "Waiting for Tap");
    const [linkedNfcId, setLinkedNfcId] = useState(data.nfcId || null);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!canAccessStep("medical")) {
            navigate(getFirstIncompleteStepPath(), { replace: true });
        }
    }, [canAccessStep, getFirstIncompleteStepPath, navigate]);

    const linkCard = async () => {
        setIsLinkingCard(true);
        setNfcStatus("Waiting for hardware reader...");
        setError("");

        try {
            const response = await hospitalAPI.linkCard();
            if (!response?.uid) {
                throw new Error("No NFC UID was received from the reader.");
            }

            setLinkedNfcId(response.uid);
            updateValue("nfcId", response.uid);
            setNfcStatus("Linked: " + response.uid);
        } catch (err) {
            console.error("Registration NFC scan failed:", err);
            setNfcStatus("Reader unavailable");
            setError(err.response?.data?.message || err.message || "Unable to read the NFC card.");
        } finally {
            setIsLinkingCard(false);
        }
    };

    const complete = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            if (!linkedNfcId && !data.nfcId) {
                setError("Please tap an NFC card to link before continuing.");
                setIsSubmitting(false);
                return;
            }

            const formData = new FormData(e.target);
            const medicalData = Object.fromEntries(formData.entries());

            if (!medicalData.bloodGroup || !medicalData.heightCm || !medicalData.weightKg) {
                setError("Complete the required medical details before continuing.");
                setIsSubmitting(false);
                return;
            }

            updateSection("medical", medicalData);
            markStepComplete("medical", true);

            navigate("/hospital/register/fingerprint");
        } catch (err) {
            console.error("Frontend logic error:", err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const goBack = () => {
        navigate("/hospital/register/contact");
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-1">Medical Info & NFC Card</h3>
                <p className="text-sm text-slate-500">Critical medical data and physical card linking.</p>
            </div>

            <form onSubmit={complete} className="space-y-4">
                {error && (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                        {error}
                    </p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Blood Group</label>
                        <select
                            name="bloodGroup"
                            defaultValue={data.medical.bloodGroup || "A+"}
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                            required
                        >
                            <option>A+</option>
                            <option>A-</option>
                            <option>B+</option>
                            <option>B-</option>
                            <option>O+</option>
                            <option>O-</option>
                            <option>AB+</option>
                            <option>AB-</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Height (cm)</label>
                        <input
                            name="heightCm"
                            type="number"
                            min="1"
                            step="0.1"
                            defaultValue={data.medical.heightCm}
                            placeholder="175"
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                            required
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Weight (kg)</label>
                        <input
                            name="weightKg"
                            type="number"
                            min="1"
                            step="0.1"
                            defaultValue={data.medical.weightKg}
                            placeholder="70"
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                            required
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Allergies</label>
                    <textarea
                        name="allergies"
                        defaultValue={data.medical.allergies}
                        placeholder="List any known allergies..."
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-emerald-500 outline-none transition-all min-h-[100px]"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Surgeries</label>
                    <textarea
                        name="surgeries"
                        defaultValue={data.medical.surgeries}
                        placeholder="Appendectomy, knee surgery, cataract surgery..."
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-emerald-500 outline-none transition-all min-h-[100px]"
                    />
                </div>

                {/* NFC CARD SECTION */}
                <div 
                    onClick={() => {
                        if (!isLinkingCard) {
                            linkCard();
                        }
                    }}
                    className="mt-8 p-6 rounded-2xl bg-emerald-50 dark:bg-emerald-900/10 border-2 border-dashed border-emerald-200 dark:border-emerald-800 flex flex-col items-center gap-4 text-center cursor-pointer hover:bg-emerald-100 transition-all"
                >
                    <div className={`size-16 rounded-full flex items-center justify-center transition-all ${(linkedNfcId || data.nfcId) ? "bg-emerald-500 text-white" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 animate-pulse"}`}>
                        <span className="material-symbols-outlined text-4xl">contactless</span>
                    </div>
                    <div>
                        <h4 className="font-bold text-emerald-800 dark:text-emerald-400">{nfcStatus}</h4>
                        <p className="text-xs text-emerald-600/70 mt-1 uppercase font-bold tracking-wider">Tap Smart-ID card to the live reader to link this profile</p>
                    </div>
                    {!(linkedNfcId || data.nfcId) && (
                        <div className="flex items-center gap-2 text-xs font-bold px-4 py-2 bg-emerald-100 text-emerald-700 dark:bg-emerald-800 dark:text-emerald-200 rounded-lg">
                            <div className="size-2 bg-emerald-500 rounded-full animate-ping"></div>
                            {isLinkingCard ? 'Scanning Card' : 'Hardware Reader Active'}
                        </div>
                    )}
                </div>

                {/* NFC UID DISPLAY BOX */}
                {(linkedNfcId || data.nfcId) && (
                    <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-2xl p-6 border border-emerald-200 dark:border-emerald-800">
                        <div className="flex items-center gap-4">
                            <div className="size-14 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-600/30">
                                <span className="material-symbols-outlined text-3xl">contactless</span>
                            </div>
                            <div className="flex-1">
                                <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-1">NFC Card UID</p>
                                <p className="text-2xl font-mono font-bold text-slate-800 dark:text-white tracking-wider">
                                    {linkedNfcId || data.nfcId}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="size-3 rounded-full bg-emerald-500 animate-pulse"></div>
                                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Card Linked</span>
                            </div>
                        </div>
                    </div>
                )}

                <div className="pt-6 flex gap-4">
                    <button
                        type="button"
                        onClick={goBack}
                        className="px-6 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-2"
                    >
                        <span className="material-symbols-outlined">arrow_back</span>
                        Back
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? "Registering..." : "Continue to Fingerprint Enrollment"}
                        <span className="material-symbols-outlined">fingerprint</span>
                    </button>
                </div>
            </form>
        </div>
    );
}
