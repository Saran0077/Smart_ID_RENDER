import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useSession } from "../../context/SessionContext";
import { useEmergency } from "../../context/EmergencyContext";
import hospitalAPI from "../../services/management.api";

export default function ClinicalNote() {
    const navigate = useNavigate();
    const { patient, otpVerified, fingerprintVerified, authMethod, resetSession } = useSession();
    const { emergency, resetEmergency } = useEmergency();
    const [note, setNote] = useState("");
    const [vitalSigns, setVitalSigns] = useState({ bp: "", pulse: "", temp: "" });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showDemographicsModal, setShowDemographicsModal] = useState(false);
    const [patientDetails, setPatientDetails] = useState(null);
    const [loadingDetails, setLoadingDetails] = useState(false);

    const hasPatientConsent = otpVerified && fingerprintVerified && authMethod === "PATIENT";
    const hasNomineeConsent = otpVerified && authMethod === "NOMINEE";
    const canWrite = emergency?.active || hasPatientConsent || hasNomineeConsent;

    if (!patient || !canWrite) {
        return <Navigate to="/hospital" replace />;
    }

    const handleViewDemographics = async () => {
        setShowDemographicsModal(true);
        setLoadingDetails(true);
        try {
            const details = await hospitalAPI.getPatientDetails(patient.id || patient._id);
            setPatientDetails(details);
        } catch (err) {
            console.error("Failed to load patient details:", err);
            setPatientDetails(null);
        } finally {
            setLoadingDetails(false);
        }
    };


    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!note.trim()) return;

        setIsSubmitting(true);
        try {
            const payload = {
                patientId: patient.id,
                content: note,
                vitals: vitalSigns,
                timestamp: new Date().toISOString()
            };

            if (emergency?.active) {
                payload.mode = "EMERGENCY";
                payload.authorizedBy = emergency.by?.id || "admin_01";
            } else {
                payload.mode = "STANDARD";
                payload.consent = {
                    otp: true,
                    biometric: authMethod === "PATIENT",
                    method: authMethod
                };
            }

            await hospitalAPI.createEmr(payload);

            alert("Clinical note saved successfully.");
            resetSession();
            resetEmergency();
            navigate("/hospital");
        } catch (err) {
            console.error("Failed to save EMR:", err);
            alert("Failed to save clinical note. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto animate-in fade-in duration-500">
            {emergency?.active && (
                <div className="bg-red-100 border border-red-400 text-red-800 p-6 rounded-2xl mb-8 flex items-center gap-4 animate-in slide-in-from-top-4 duration-500 shadow-xl shadow-red-500/10">
                    <span className="material-symbols-outlined text-red-600 text-3xl shrink-0">emergency</span>
                    <p className="font-bold text-lg">
                        🚨 EMERGENCY OVERRIDE ACTIVE — All actions are logged and audited against Admin: {emergency.by?.name}
                    </p>
                </div>
            )}

            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800 dark:text-white">New Clinical Note</h1>
                    <p className="text-slate-500 mt-1">Authorized EMR entry for {patient.name}</p>
                </div>
                {emergency?.active ? (
                    <div className="flex items-center gap-2 px-4 py-2 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 rounded-full text-sm font-bold border border-red-200 dark:border-red-800">
                        <span className="material-symbols-outlined text-sm">gavel</span>
                        Institutional Authority
                    </div>
                ) : (
                    <div className="flex items-center gap-2 px-4 py-2 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 rounded-full text-sm font-bold border border-emerald-200 dark:border-emerald-800">
                        <span className="material-symbols-outlined text-sm">verified_user</span>
                        Consent Verified
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Editor */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none">
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Describe symptoms, diagnosis, and treatment plan..."
                            className="w-full min-h-[400px] border-none focus:ring-0 text-lg text-slate-700 dark:text-slate-200 bg-transparent resize-none outline-none"
                            autoFocus
                        />
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting || !note.trim()}
                            className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <span className="material-symbols-outlined">save</span>
                            {isSubmitting ? "Saving..." : "Save to EMR"}
                        </button>
                        <button
                            onClick={() => {
                                if (confirm("Are you sure? Unsaved changes will be lost.")) {
                                    resetSession();
                                    navigate("/hospital");
                                }
                            }}
                            className="px-8 py-4 bg-white dark:bg-slate-800 text-slate-400 font-bold rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                        >
                            Discard
                        </button>
                    </div>
                </div>

                {/* Sidebar: Details & Vitals */}
                <div className="space-y-6">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800">
                        <h3 className="font-bold text-slate-800 dark:text-white mb-4">Vital Signs</h3>
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Blood Pressure</label>
                                <input
                                    type="text"
                                    placeholder="120/80"
                                    value={vitalSigns.bp}
                                    onChange={(e) => setVitalSigns({ ...vitalSigns, bp: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:border-emerald-500 transition-all font-mono"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pulse Rate (BPM)</label>
                                <input
                                    type="text"
                                    placeholder="72"
                                    value={vitalSigns.pulse}
                                    onChange={(e) => setVitalSigns({ ...vitalSigns, pulse: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:border-emerald-500 transition-all font-mono"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Temperature (°C)</label>
                                <input
                                    type="text"
                                    placeholder="37.0"
                                    value={vitalSigns.temp}
                                    onChange={(e) => setVitalSigns({ ...vitalSigns, temp: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:border-emerald-500 transition-all font-mono"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-emerald-600 rounded-3xl p-6 text-white shadow-xl shadow-emerald-600/20">
                        <h3 className="font-bold mb-4 flex items-center gap-2">
                            <span className="material-symbols-outlined">account_circle</span>
                            Patient Profile
                        </h3>
                        <div className="space-y-3 opacity-90 text-sm font-medium">
                            <div className="flex justify-between">
                                <span>Blood Group</span>
                                <span className="font-bold">{patient.bloodGroup || "O+"}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Age</span>
                                <span>{patient.age || "32"} Yrs</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Gender</span>
                                <span className="capitalize">{patient.gender || "Male"}</span>
                            </div>
                        </div>
                        <hr className="my-4 border-white/20" />
                        <button
                            onClick={handleViewDemographics}
                            className="w-full py-2 bg-white/20 hover:bg-white/30 rounded-xl text-xs font-bold transition-all"
                        >
                            View Full Demographics
                        </button>
                    </div>
                </div>
            </div>

            {showDemographicsModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white">Patient Full Demographics</h3>
                            <button
                                onClick={() => setShowDemographicsModal(false)}
                                className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                            >
                                <span className="material-symbols-outlined text-slate-500">close</span>
                            </button>
                        </div>
                        <div className="p-6 max-h-[70vh] overflow-y-auto">
                            {loadingDetails ? (
                                <div className="flex items-center justify-center p-12">
                                    <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
                                </div>
                            ) : patientDetails ? (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <InfoItem label="Full Name" value={patientDetails.fullName} />
                                        <InfoItem label="Date of Birth" value={patientDetails.dob ? new Date(patientDetails.dob).toLocaleDateString() : 'N/A'} />
                                        <InfoItem label="Age" value={patientDetails.age ? `${patientDetails.age} years` : 'N/A'} />
                                        <InfoItem label="Gender" value={patientDetails.gender ? patientDetails.gender.charAt(0).toUpperCase() + patientDetails.gender.slice(1) : 'N/A'} />
                                        <InfoItem label="Blood Group" value={patientDetails.bloodGroup} />
                                        <InfoItem label="Phone" value={patientDetails.phone} />
                                        <InfoItem label="Email" value={patientDetails.email || 'N/A'} />
                                        <InfoItem label="Address" value={patientDetails.address || 'N/A'} />
                                        <InfoItem label="Height" value={patientDetails.heightCm ? `${patientDetails.heightCm} cm` : 'N/A'} />
                                        <InfoItem label="Weight" value={patientDetails.weightKg ? `${patientDetails.weightKg} kg` : 'N/A'} />
                                    </div>
                                    {patientDetails.emergencyContact && (
                                        <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-4 border border-red-200 dark:border-red-800">
                                            <h4 className="text-sm font-bold text-red-700 dark:text-red-400 mb-2">Emergency Contact</h4>
                                            <p className="text-sm text-slate-700 dark:text-slate-300">
                                                {patientDetails.emergencyContact.name} - {patientDetails.emergencyContact.phone}
                                            </p>
                                        </div>
                                    )}
                                    {patientDetails.allergies && patientDetails.allergies.length > 0 && (
                                        <div>
                                            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Allergies</h4>
                                            <div className="flex flex-wrap gap-2">
                                                {patientDetails.allergies.map((allergy, i) => (
                                                    <span key={i} className="px-3 py-1 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full text-sm font-bold border border-red-200 dark:border-red-800">
                                                        {allergy}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {patientDetails.surgeries && patientDetails.surgeries.length > 0 && (
                                        <div>
                                            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Surgeries</h4>
                                            <ul className="list-disc list-inside text-sm text-slate-600 dark:text-slate-400">
                                                {patientDetails.surgeries.map((surgery, i) => (
                                                    <li key={i}>{surgery}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center text-slate-500">Failed to load patient details</div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function InfoItem({ label, value }) {
    return (
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
            <p className="text-sm font-semibold text-slate-800 dark:text-white">{value || 'N/A'}</p>
        </div>
    );
}
