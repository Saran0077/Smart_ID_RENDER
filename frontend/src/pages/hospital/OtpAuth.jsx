import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useSession } from "../../context/SessionContext";
import hospitalAPI from "../../services/management.api";

const CONSENT_TARGET = {
    PATIENT: 'PATIENT',
    NOMINEE: 'NOMINEE'
};

const RESEND_TIMER_SECONDS = 30;

export default function OtpAuth() {
    const navigate = useNavigate();
    const { patient, setOtpVerified, setAuthMethod, nomineeInfo } = useSession();
    
    const [otp, setOtp] = useState("");
    const [otpSent, setOtpSent] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState(null);
    const [resendTimer, setResendTimer] = useState(0);
    const [consentTarget, setConsentTarget] = useState(CONSENT_TARGET.PATIENT);
    const [failedAttempts, setFailedAttempts] = useState(0);
    const [nomineeConfigured, setNomineeConfigured] = useState(false);

    // Check if nominee is configured
    useEffect(() => {
        if (nomineeInfo?.phone) {
            setNomineeConfigured(true);
        }
    }, [nomineeInfo]);

    // Get current phone based on consent target
    const getCurrentPhone = useCallback(() => {
        if (consentTarget === CONSENT_TARGET.NOMINEE) {
            return nomineeInfo?.phone || patient?.emergencyContact?.phone;
        }
        return patient?.phone;
    }, [consentTarget, nomineeInfo, patient]);

    // Send OTP function
    const sendOTP = useCallback(async (target = consentTarget) => {
        const isNominee = target === CONSENT_TARGET.NOMINEE;
        const phone = isNominee
            ? (nomineeInfo?.phone || patient?.emergencyContact?.phone)
            : patient?.phone;
        const patientId = patient?._id || patient?.id;

        if (!phone) {
            toast.error(isNominee ? "Nominee phone not configured" : "Patient phone not available");
            return false;
        }

        setIsSending(true);
        setError(null);

        try {
            const response = isNominee
                ? await hospitalAPI.sendNomineeOtp(phone, patientId)
                : await hospitalAPI.sendOtp(phone, patientId);

            const wasSuccessful = response?.success === true || response?.status === "success";

            if (wasSuccessful) {
                toast.success(response.message);
                setOtpSent(true);
                setResendTimer(RESEND_TIMER_SECONDS);
                return true;
            } else {
                setError(response.error || "Failed to send OTP");
                return false;
            }
        } catch (err) {
            const isTimeout = err.code === "ECONNABORTED" || err.message?.toLowerCase().includes("timeout");
            const errorMsg = isTimeout
                ? "OTP request timed out. If the SMS already arrived, enter it below."
                : err.response?.data?.error || err.response?.data?.message || "Failed to send OTP";

            if (isTimeout) {
                setOtpSent(true);
                setResendTimer(RESEND_TIMER_SECONDS);
            }

            setError(errorMsg);
            toast.error(errorMsg);
            return false;
        } finally {
            setIsSending(false);
        }
    }, [consentTarget, nomineeInfo, patient]);

    useEffect(() => {
        if (!patient) {
            navigate("/hospital");
            return;
        }

        const timer = setInterval(() => {
            setResendTimer((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);

        return () => clearInterval(timer);
    }, [patient, navigate, sendOTP]);

    // Handle OTP verification
    const handleVerify = async (e) => {
        e.preventDefault();
        if (otp.length < 6) {
            setError("Please enter the complete 6-digit OTP");
            return;
        }

        setIsVerifying(true);
        setError(null);

        const isNominee = consentTarget === CONSENT_TARGET.NOMINEE;
        const phone = getCurrentPhone();
        const patientId = patient?._id || patient?.id;

        try {
            const verifyFn = isNominee ? hospitalAPI.verifyNomineeOtp : hospitalAPI.verifyOtp;
            const res = await verifyFn(phone, otp, patientId);
            
            if (res.success) {
                setOtpVerified(true);
                setAuthMethod(isNominee ? CONSENT_TARGET.NOMINEE : CONSENT_TARGET.PATIENT);
                toast.success(isNominee ? "Nominee consent verified" : "Patient consent verified");
                navigate(isNominee ? "/hospital/clinical-note" : "/hospital/clinical-note/biometric");
            } else {
                handleFailedAttempt();
            }
        } catch (err) {
            const errorMsg = err.response?.data?.error || "Verification failed";
            setError(errorMsg);
            handleFailedAttempt();
        } finally {
            setIsVerifying(false);
        }
    };

    // Handle failed OTP attempt
    const handleFailedAttempt = () => {
        setFailedAttempts((prev) => prev + 1);
        setOtp("");
        
        if (failedAttempts >= 2) {
            setError("Too many failed attempts. Please request a new OTP.");
        } else {
            const attemptsLeft = 3 - (failedAttempts + 1);
            setError(`Invalid OTP. ${attemptsLeft} attempt(s) remaining.`);
        }
    };

    // Handle resend OTP
    const handleResend = async () => {
        if (resendTimer > 0) return;
        
        // Reset failed attempts on resend
        setFailedAttempts(0);
        setOtp("");
        
        await sendOTP(consentTarget);
    };

    // Switch consent target (Patient/Nominee)
    const switchConsentTarget = async (target) => {
        if (target === CONSENT_TARGET.NOMINEE && !nomineeConfigured) {
            toast.error("Nominee contact not configured for this patient");
            return;
        }

        setConsentTarget(target);
        setOtpSent(false);
        setResendTimer(0);
        setFailedAttempts(0);
        setOtp("");
        setError(null);
    };

    // Format phone for display
    const formatPhoneForDisplay = (phone) => {
        if (!phone) return "Not available";
        return phone.slice(0, 3) + '*****' + phone.slice(-4);
    };

    if (!patient) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200">

                <div className="p-8 text-center">
                    <div className="mx-auto size-16 bg-emerald-100 dark:bg-emerald-900/40 rounded-full flex items-center justify-center mb-6">
                        <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-3xl">
                            lock_person
                        </span>
                    </div>

                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Patient Consent Required</h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-2">
                        Enter the 6-digit authorization code sent to the recipient
                    </p>
                </div>

                <div className="px-8 pb-8">
                    {/* Consent Target Toggle */}
                    <div className="mb-6">
                        <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                            <button
                                type="button"
                                onClick={() => switchConsentTarget(CONSENT_TARGET.PATIENT)}
                                disabled={consentTarget === CONSENT_TARGET.PATIENT}
                                className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all ${
                                    consentTarget === CONSENT_TARGET.PATIENT
                                        ? 'bg-emerald-600 text-white shadow-md'
                                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                            >
                                Patient OTP
                            </button>
                            <button
                                type="button"
                                onClick={() => switchConsentTarget(CONSENT_TARGET.NOMINEE)}
                                disabled={consentTarget === CONSENT_TARGET.NOMINEE || !nomineeConfigured}
                                className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all ${
                                    consentTarget === CONSENT_TARGET.NOMINEE
                                        ? 'bg-emerald-600 text-white shadow-md'
                                        : nomineeConfigured
                                            ? 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                            : 'text-slate-400 cursor-not-allowed'
                                }`}
                                title={!nomineeConfigured ? "Nominee contact not configured" : ""}
                            >
                                Nominee OTP {!nomineeConfigured && '⚠️'}
                            </button>
                        </div>
                        
                        {/* Recipient Info */}
                        <div className="mt-3 text-center">
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                {otpSent ? "OTP sent to " : "Send OTP to "}
                                <span className="font-mono font-bold">{formatPhoneForDisplay(getCurrentPhone())}</span>
                                {consentTarget === CONSENT_TARGET.NOMINEE && nomineeInfo?.name && (
                                    <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                                        ({nomineeInfo.name})
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>

                    {/* OTP Input Form */}
                    <form onSubmit={handleVerify} className="space-y-6">
                        <button
                            type="button"
                            onClick={() => sendOTP(consentTarget)}
                            disabled={isSending || !getCurrentPhone() || (otpSent && resendTimer > 0)}
                            className="w-full py-3 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 dark:text-slate-900 text-white font-bold rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isSending ? (
                                <>
                                    <span className="w-5 h-5 border-2 border-white/30 dark:border-slate-900/20 border-t-white dark:border-t-slate-900 rounded-full animate-spin"></span>
                                    Sending OTP...
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined">sms</span>
                                    {otpSent ? (resendTimer > 0 ? `OTP Sent (${resendTimer}s)` : "Send OTP Again") : "Send OTP"}
                                </>
                            )}
                        </button>

                        <div>
                            <input
                                type="text"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                placeholder="0 0 0 0 0 0"
                                className="w-full text-center text-3xl tracking-widest font-bold py-4 rounded-2xl border-2 border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:border-emerald-500 outline-none transition-all dark:text-white"
                                autoFocus
                                disabled={isVerifying || !otpSent}
                            />
                            {error && (
                                <p className="text-red-500 text-sm font-bold mt-2 text-center">{error}</p>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={isVerifying || otp.length < 6 || isSending || !otpSent}
                            className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isVerifying ? (
                                <>
                                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                    Verifying...
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined">verified</span>
                                    Confirm Authorization
                                </>
                            )}
                        </button>
                    </form>

                    {/* Resend & Switch Options */}
                    <div className="mt-8 flex flex-col gap-4">
                        <div className="flex items-center justify-between text-sm">
                            <button
                                type="button"
                                onClick={handleResend}
                                disabled={!otpSent || resendTimer > 0 || isSending}
                                className="text-emerald-600 font-bold disabled:text-slate-400 flex items-center gap-2"
                            >
                                {isSending ? (
                                    <>
                                        <span className="w-4 h-4 border-2 border-emerald-600/30 border-t-emerald-600 rounded-full animate-spin"></span>
                                        Sending...
                                    </>
                                ) : (
                                    <>
                                        {otpSent ? `Resend Code ${resendTimer > 0 ? `(${resendTimer}s)` : ""}` : "Send OTP first"}
                                    </>
                                )}
                            </button>

                            {nomineeConfigured && consentTarget === CONSENT_TARGET.PATIENT && (
                                <button
                                    type="button"
                                    onClick={() => switchConsentTarget(CONSENT_TARGET.NOMINEE)}
                                    className="text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 underline underline-offset-4 text-sm"
                                >
                                    Use Nominee OTP instead
                                </button>
                            )}
                            
                            {nomineeConfigured && consentTarget === CONSENT_TARGET.NOMINEE && (
                                <button
                                    type="button"
                                    onClick={() => switchConsentTarget(CONSENT_TARGET.PATIENT)}
                                    className="text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 underline underline-offset-4 text-sm"
                                >
                                    Use Patient OTP instead
                                </button>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => navigate("/hospital")}
                            className="w-full py-3 text-slate-400 font-bold hover:text-red-500 transition-all text-sm"
                        >
                            Cancel & Return to Dashboard
                        </button>
                    </div>
                </div>

                {/* Info Footer */}
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-start gap-3">
                        <span className="material-symbols-outlined text-slate-400 text-sm mt-0.5">info</span>
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider leading-tight">
                            {consentTarget === CONSENT_TARGET.NOMINEE 
                                ? "Nominee consent is used when the patient is unconscious or unable to provide consent. Nominee OTP will be sent to the registered emergency contact number."
                                : "OTP represents legal consent for medical record access. This session is being recorded for audit purposes."
                            }
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
