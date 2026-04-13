import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { usePatientRegistration } from "../../../context/PatientRegistrationContext";
import { useAuth } from "../../../auth/AuthProvider";
import hospitalAPI from "../../../services/management.api";

const STATES = {
    IDLE: "idle",
    ENROLLING: "enrolling",
    SCANNING: "scanning",
    REGISTERING: "registering",
    SUCCESS: "success",
    ERROR: "error"
};

const TIMEOUT_SECONDS = 30;
const POLL_INTERVAL = 2000;

const buildRegistrationPayload = (registrationData, fingerprintId = null) => {
    const { email: _email, ...contactWithoutEmail } = registrationData.contact || {};

    return {
        ...registrationData.personal,
        ...contactWithoutEmail,
        ...registrationData.medical,
        nfcId: registrationData.nfcId,
        ...(fingerprintId ? { fingerprintId } : {})
    };
};

const extractFingerprintId = (payload) => {
    if (!payload || typeof payload !== "object") {
        return null;
    }

    return (
        payload.fingerprintId ||
        payload.fingerId ||
        payload.finger_id ||
        payload.enrollment?.fingerprintId ||
        payload.enrollment?.fingerId ||
        payload.enrollment?.finger_id ||
        null
    );
};

const getRegistrationFailureDetails = (error) => {
    const responseData = error.response?.data || {};
    const cleanupAttempted = Boolean(responseData.fingerprintCleanupAttempted);
    const cleanupSucceeded = Boolean(responseData.fingerprintCleanupSucceeded);
    const cleanupReason = responseData.fingerprintCleanupReason;

    let message =
        responseData.message ||
        error.message ||
        "Patient registration failed after fingerprint enrollment.";

    if (cleanupAttempted && cleanupSucceeded) {
        message += " The enrolled fingerprint was removed from the sensor.";
    } else if (cleanupAttempted && !cleanupSucceeded) {
        message += " The enrolled fingerprint could not be removed automatically.";
    } else if (cleanupReason === "linked-to-existing-patient") {
        message += " Cleanup was skipped because that fingerprint ID is already linked to an existing patient.";
    }

    return {
        message,
        cleanupAttempted,
        cleanupSucceeded,
        cleanupReason
    };
};

export default function Step4FingerAuth() {
    const navigate = useNavigate();
    const {
        data,
        updateValue,
        markStepComplete,
        clearDraft,
        canAccessStep,
        getFirstIncompleteStepPath
    } = usePatientRegistration();
    useAuth();

    const [enrollState, setEnrollState] = useState(STATES.IDLE);
    const [errorMessage, setErrorMessage] = useState("");
    const [fingerId, setFingerId] = useState(null);
    const [timeLeft, setTimeLeft] = useState(TIMEOUT_SECONDS);
    const [registrationConflict, setRegistrationConflict] = useState(null);
    const [registrationResult, setRegistrationResult] = useState(data.registrationResult || null);

    const countdownRef = useRef(null);
    const timeoutRef = useRef(null);
    const pollingRef = useRef(null);
    const pollingInFlightRef = useRef(false);
    const countdownActiveRef = useRef(false);
    const enrollStateRef = useRef(STATES.IDLE);
    const hasCompletedEnrollmentRef = useRef(false);
    const hasSubmittedRegistrationRef = useRef(false);

    const setEnrollmentState = useCallback((nextState) => {
        enrollStateRef.current = nextState;
        setEnrollState(nextState);
    }, []);

    const clearCountdownTimers = useCallback(() => {
        if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
        }
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        countdownActiveRef.current = false;
    }, []);

    const clearPollingTimer = useCallback(() => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
        pollingInFlightRef.current = false;
    }, []);

    const resetOperationGuards = useCallback(() => {
        hasCompletedEnrollmentRef.current = false;
        hasSubmittedRegistrationRef.current = false;
        pollingInFlightRef.current = false;
    }, []);

    const startCountdown = useCallback(() => {
        clearCountdownTimers();
        setTimeLeft(TIMEOUT_SECONDS);
        countdownActiveRef.current = true;

        countdownRef.current = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(countdownRef.current);
                    countdownRef.current = null;
                    countdownActiveRef.current = false;
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        timeoutRef.current = setTimeout(async () => {
            clearCountdownTimers();
            clearPollingTimer();
            try {
                await hospitalAPI.cancelFingerprintEnrollment();
            } catch (cancelErr) {
                console.log("Cancel on timeout (non-critical):", cancelErr.message);
            }
            setEnrollmentState(STATES.ERROR);
            setErrorMessage(`Scan timed out (${TIMEOUT_SECONDS}s). Please try again.`);
        }, TIMEOUT_SECONDS * 1000);
    }, [clearCountdownTimers, clearPollingTimer, setEnrollmentState]);

    const ensureCountdownRunning = useCallback(() => {
        if (!countdownActiveRef.current) {
            startCountdown();
        }
    }, [startCountdown]);

    useEffect(() => {
        if (!canAccessStep("fingerprint")) {
            navigate(getFirstIncompleteStepPath(), { replace: true });
        }

        return () => {
            clearCountdownTimers();
            clearPollingTimer();
        };
    }, [canAccessStep, clearCountdownTimers, clearPollingTimer, getFirstIncompleteStepPath, navigate]);

    const handleEnrollmentFailure = useCallback(async (message) => {
        clearCountdownTimers();
        clearPollingTimer();
        setEnrollmentState(STATES.ERROR);
        setErrorMessage(message);

        if (message.includes("not found") || message.includes("not in progress") || message.includes("failed")) {
            try {
                await hospitalAPI.cancelFingerprintEnrollment();
                console.log("Hardware state reset successfully");
            } catch (cancelErr) {
                console.log("Cancel error (non-critical):", cancelErr.message);
            }
        }
    }, [clearCountdownTimers, clearPollingTimer, setEnrollmentState]);

    const runPatientRegistration = useCallback(async (finalFingerprintId) => {
        if (hasSubmittedRegistrationRef.current) {
            return;
        }

        hasSubmittedRegistrationRef.current = true;
        setFingerId(finalFingerprintId);
        updateValue("fingerprintId", finalFingerprintId);
        setRegistrationConflict(null);
        setEnrollmentState(STATES.REGISTERING);

        try {
            const registrationPayload = buildRegistrationPayload(data, finalFingerprintId);
            const registerResponse = await hospitalAPI.registerPatient(registrationPayload);
            const nextRegistrationResult = {
                ...registerResponse,
                fingerprintEnrolled: true,
                patientName: registerResponse?.patient?.fullName || registerResponse?.fullName || data.personal?.fullName || "",
            };

            updateValue("patientId", registerResponse.patientId);
            updateValue("registrationResult", nextRegistrationResult);
            markStepComplete("fingerprint", true);
            setRegistrationResult(nextRegistrationResult);
            setEnrollmentState(STATES.SUCCESS);
        } catch (err) {
            console.error("Registration error:", err);
            const failureDetails = getRegistrationFailureDetails(err);

            setEnrollmentState(STATES.ERROR);
            if (err.response?.status === 409) {
                const conflictField = err.response?.data?.field || "unknown";
                const conflictLabelMap = {
                    govtId: "government ID",
                    phone: "phone number",
                    nfcUuid: "NFC card",
                    fingerprintId: "fingerprint",
                    username: "patient username",
                    user: "patient account"
                };

                setRegistrationConflict({
                    code: err.response?.data?.code || "PATIENT_DUPLICATE_CONFLICT",
                    field: conflictField,
                    fieldLabel: conflictLabelMap[conflictField] || "registration data",
                    message: failureDetails.message,
                    cleanupAttempted: failureDetails.cleanupAttempted,
                    cleanupSucceeded: failureDetails.cleanupSucceeded,
                    cleanupReason: failureDetails.cleanupReason
                });
            } else {
                setRegistrationConflict(null);
            }

            setErrorMessage(failureDetails.message);
            hasSubmittedRegistrationRef.current = false;
        }
    }, [data, markStepComplete, setEnrollmentState, updateValue]);

    const handleEnrollmentComplete = useCallback(async (newFingerId) => {
        if (hasCompletedEnrollmentRef.current) {
            return;
        }

        hasCompletedEnrollmentRef.current = true;
        clearCountdownTimers();
        clearPollingTimer();

        if (!newFingerId) {
            setEnrollmentState(STATES.ERROR);
            setErrorMessage("Enrollment completed but fingerprint ID not received.");
            hasSubmittedRegistrationRef.current = false;
            return;
        }

        await runPatientRegistration(`${newFingerId}`);
    }, [clearCountdownTimers, clearPollingTimer, runPatientRegistration, setEnrollmentState]);

    const handleStartEnrollment = useCallback(async () => {
        clearCountdownTimers();
        clearPollingTimer();
        resetOperationGuards();
        setEnrollmentState(STATES.ENROLLING);
        setErrorMessage("");
        setRegistrationConflict(null);
        setFingerId(null);
        setTimeLeft(TIMEOUT_SECONDS);
        setRegistrationResult(null);
        updateValue("patientId", null);
        updateValue("registrationResult", null);

        try {
            await hospitalAPI.validatePatientRegistration(buildRegistrationPayload(data));

            const response = await hospitalAPI.startFingerprintEnrollment();

            if (!response.success) {
                throw new Error(response.message || "Failed to start enrollment");
            }

            setEnrollmentState(STATES.SCANNING);
            startCountdown();

            pollingRef.current = setInterval(async () => {
                if (hasCompletedEnrollmentRef.current || pollingInFlightRef.current) {
                    return;
                }

                pollingInFlightRef.current = true;

                try {
                    const statusResponse = await hospitalAPI.getFingerprintEnrollmentStatus(response.operationId);
                    const step = statusResponse.step || statusResponse.enrollment?.step || "";

                    if (
                        step === "place_finger" ||
                        step === "waiting" ||
                        step === "waiting_first_scan" ||
                        step === "waiting_first" ||
                        step === "waiting_second" ||
                        step === "waiting_second_scan"
                    ) {
                        if (enrollStateRef.current !== STATES.SCANNING) {
                            setEnrollmentState(STATES.SCANNING);
                        }
                        ensureCountdownRunning();
                        return;
                    }

                    if (statusResponse.completed || step === "completed") {
                        let finalizedFingerprintId = extractFingerprintId(statusResponse);

                        try {
                            const completeResponse = await hospitalAPI.completeFingerprintEnrollment();
                            finalizedFingerprintId = extractFingerprintId(completeResponse) || finalizedFingerprintId;
                        } catch (completeErr) {
                            console.warn("Complete enrollment fallback used:", completeErr.response?.data?.message || completeErr.message);
                        }

                        await handleEnrollmentComplete(finalizedFingerprintId);
                        return;
                    }

                    if (statusResponse.failed || step === "failed" || statusResponse.error) {
                        const message = statusResponse.error || "Enrollment failed";
                        await handleEnrollmentFailure(message);
                    }
                } catch (err) {
                    const status = err.response?.status;
                    const errorCode = err.response?.data?.code;
                    const isTimeout =
                        err.code === "ECONNABORTED" ||
                        err.message?.includes("timeout") ||
                        errorCode === "HARDWARE_TIMEOUT";

                    if (isTimeout || status === 504) {
                        await handleEnrollmentFailure("Scanner timeout. Please try again.");
                        return;
                    }

                    if (status === 503 && errorCode === "HARDWARE_NOT_CONFIGURED") {
                        clearCountdownTimers();
                        clearPollingTimer();
                        setEnrollmentState(STATES.ERROR);
                        setErrorMessage("Fingerprint hardware bridge is not configured.");
                        return;
                    }

                    if (status === 404) {
                        await handleEnrollmentFailure("Scanner not available. Please check hardware connection.");
                        return;
                    }

                    if (status === 400) {
                        const backendMessage = err.response?.data?.error || err.response?.data?.message;
                        if (backendMessage?.includes("not initialized") || backendMessage?.includes("sensor")) {
                            clearCountdownTimers();
                            clearPollingTimer();
                            setEnrollmentState(STATES.ERROR);
                            setErrorMessage("Fingerprint sensor not connected or not initialized.");
                            return;
                        }

                        await handleEnrollmentFailure(backendMessage || "Scanner error. Please try again.");
                        return;
                    }

                    if (status === 401 || status === 403) {
                        await handleEnrollmentFailure("Authentication error. Please refresh and try again.");
                        return;
                    }

                    console.error("Polling error:", err);
                } finally {
                    pollingInFlightRef.current = false;
                }
            }, POLL_INTERVAL);
        } catch (err) {
            clearCountdownTimers();
            clearPollingTimer();
            console.error("Start enrollment error:", err);

            const status = err.response?.status;
            const errorCode = err.response?.data?.code;
            const isTimeout =
                err.code === "ECONNABORTED" ||
                err.message?.includes("timeout") ||
                errorCode === "HARDWARE_TIMEOUT";

            let message;

            if (status === 503 && errorCode === "HARDWARE_NOT_CONFIGURED") {
                message = "Fingerprint hardware bridge is not configured.";
            } else if (
                status === 400 &&
                (
                    err.response?.data?.error?.includes("not initialized") ||
                    err.response?.data?.message?.includes("not initialized") ||
                    err.response?.data?.error?.includes("sensor") ||
                    err.response?.data?.message?.includes("sensor")
                )
            ) {
                message = "Fingerprint sensor not connected or not initialized.";
            } else if (isTimeout || status === 504) {
                message = "Scanner timeout. Please check hardware connection.";
            } else if (status === 401) {
                message = "Hardware authentication failed. Please contact administrator.";
            } else if (status === 503) {
                message = "Scanner service unavailable. Please check hardware.";
            } else {
                message = err.response?.data?.message || err.response?.data?.error || err.message || "Failed to start enrollment. Please try again.";
            }

            await handleEnrollmentFailure(message);
        }
    }, [
        clearCountdownTimers,
        clearPollingTimer,
        data,
        ensureCountdownRunning,
        handleEnrollmentComplete,
        handleEnrollmentFailure,
        resetOperationGuards,
        setEnrollmentState,
        startCountdown,
        updateValue
    ]);

    const handleRetry = async () => {
        clearCountdownTimers();
        clearPollingTimer();
        resetOperationGuards();
        setErrorMessage("");
        setRegistrationConflict(null);
        setFingerId(null);
        setTimeLeft(TIMEOUT_SECONDS);
        setRegistrationResult(null);

        try {
            await hospitalAPI.cancelFingerprintEnrollment();
            console.log("Hardware state reset on retry");
        } catch (cancelErr) {
            console.log("Cancel error (non-critical):", cancelErr.message);
        }

        setEnrollmentState(STATES.IDLE);
    };

    const handleCompleteRegistration = () => {
        const completedRegistration = registrationResult || data.registrationResult;

        if (!data.patientId || !completedRegistration) {
            setEnrollmentState(STATES.ERROR);
            setErrorMessage("Patient registration is not complete yet. Please retry before leaving this page.");
            return;
        }

        clearDraft();
        navigate("/hospital/register/success", {
            state: {
                registration: completedRegistration,
                patientId: completedRegistration.patientId || data.patientId,
                patientName: completedRegistration.patientName,
                nfcId: completedRegistration.nfcId || data.nfcId,
                fingerId,
                fingerprintEnrolled: true
            }
        });
    };

    const goBack = () => {
        clearCountdownTimers();
        clearPollingTimer();
        navigate("/hospital/register/medical");
    };

    const isActive =
        enrollState === STATES.ENROLLING ||
        enrollState === STATES.SCANNING ||
        enrollState === STATES.REGISTERING;

    const canGoBack = !isActive;
    const showScanning = enrollState === STATES.SCANNING;
    const showProgress = enrollState === STATES.REGISTERING;

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-1">
                    Fingerprint Enrollment
                </h3>
                <p className="text-sm text-slate-500">
                    Capture the patient&apos;s biometric fingerprint for future authentication.
                </p>
            </div>

            <div className={`mt-6 p-6 rounded-2xl border-2 border-dashed flex flex-col items-center gap-5 text-center transition-all
                ${enrollState === STATES.SUCCESS
                    ? "bg-emerald-50 dark:bg-emerald-900/10 border-emerald-400 dark:border-emerald-600"
                    : enrollState === STATES.ERROR
                        ? "bg-red-50 dark:bg-red-900/10 border-red-300 dark:border-red-700"
                        : enrollState === STATES.ENROLLING
                            ? "bg-blue-50 dark:bg-blue-900/10 border-blue-300 dark:border-blue-700"
                            : showProgress
                                ? "bg-indigo-50 dark:bg-indigo-900/10 border-indigo-300 dark:border-indigo-700"
                                : showScanning
                                    ? "bg-emerald-50 dark:bg-emerald-900/10 border-emerald-300 dark:border-emerald-700"
                                    : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                }`}>

                <div className={`size-20 rounded-full flex items-center justify-center transition-all
                    ${enrollState === STATES.SUCCESS
                        ? "bg-emerald-500 text-white"
                        : enrollState === STATES.ERROR
                            ? "bg-red-500 text-white"
                            : enrollState === STATES.ENROLLING
                                ? "bg-blue-500 text-white"
                                : showProgress
                                    ? "bg-indigo-500 text-white"
                                    : showScanning
                                        ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400"
                                        : "bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500"
                    }`}>
                    <span className="material-symbols-outlined text-5xl">
                        {enrollState === STATES.SUCCESS ? "check_circle" :
                            enrollState === STATES.ERROR ? "error" :
                                enrollState === STATES.ENROLLING ? "fingerprint" :
                                    showProgress ? "sync" :
                                        "fingerprint"}
                    </span>
                </div>

                <div className="space-y-2">
                    <h4 className={`font-bold text-lg
                        ${enrollState === STATES.SUCCESS ? "text-emerald-700 dark:text-emerald-400" :
                            enrollState === STATES.ERROR ? "text-red-700 dark:text-red-400" :
                                enrollState === STATES.ENROLLING ? "text-blue-700 dark:text-blue-400" :
                                    showProgress ? "text-indigo-700 dark:text-indigo-400" :
                                        showScanning ? "text-emerald-700 dark:text-emerald-400" :
                                            "text-slate-700 dark:text-slate-300"}`}>
                        {enrollState === STATES.SUCCESS ? "Enrollment Successful" :
                            enrollState === STATES.ERROR ? "Enrollment Failed" :
                                enrollState === STATES.ENROLLING ? "Starting..." :
                                    enrollState === STATES.REGISTERING ? "Registering..." :
                                        showScanning ? "Place Finger" :
                                            "Ready to Scan"}
                    </h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                        {enrollState === STATES.SUCCESS
                            ? "Fingerprint enrollment and patient registration are complete. Click Complete Registration to finish."
                            : enrollState === STATES.ERROR
                                ? errorMessage
                                : enrollState === STATES.ENROLLING
                                    ? "Validating registration data and initializing the fingerprint scanner..."
                                    : showProgress
                                        ? "Processing enrollment and registering patient..."
                                        : showScanning
                                            ? `Place finger on scanner and hold steady... ${timeLeft}s remaining`
                                            : "Click START ENROLLMENT to begin fingerprint capture."}
                    </p>
                    {registrationConflict && fingerId && (
                        <div className="mx-auto mt-4 max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left dark:border-amber-900/40 dark:bg-amber-900/20">
                            <p className="text-xs font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">
                                Registration Conflict
                            </p>
                            <p className="mt-1 text-sm font-medium text-amber-700 dark:text-amber-300">
                                Fingerprint enrollment succeeded with ID {fingerId}, but patient registration failed: {registrationConflict.message}
                            </p>
                            {registrationConflict.fieldLabel && (
                                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                                    Conflicting field: {registrationConflict.fieldLabel}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {showScanning && (
                    <div className="w-full max-w-xs">
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-500">Scanning</span>
                            <span className={`font-mono font-bold ${timeLeft <= 10 ? "text-red-500" : "text-emerald-600"}`}>
                                {timeLeft}s
                            </span>
                        </div>
                        <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-1000 ${timeLeft <= 10 ? "bg-red-500" : "bg-emerald-500"}`}
                                style={{ width: `${(timeLeft / TIMEOUT_SECONDS) * 100}%` }}
                            />
                        </div>
                    </div>
                )}

                {showProgress && (
                    <div className="w-full max-w-xs">
                        <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 animate-pulse w-full" />
                        </div>
                    </div>
                )}
            </div>

            {enrollState === STATES.IDLE && (
                <button
                    onClick={handleStartEnrollment}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-3"
                >
                    <span className="material-symbols-outlined text-2xl">fingerprint</span>
                    START ENROLLMENT
                </button>
            )}

            {enrollState === STATES.ENROLLING && (
                <button
                    disabled={true}
                    className="w-full py-4 bg-slate-400 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-3 opacity-50"
                >
                    <span className="material-symbols-outlined text-2xl animate-spin">sync</span>
                    INITIALIZING...
                </button>
            )}

            {showScanning && (
                <button
                    disabled={true}
                    className="w-full py-4 bg-emerald-500 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-3 opacity-80"
                >
                    <span className="material-symbols-outlined text-2xl">fingerprint</span>
                    PLACE FINGER...
                </button>
            )}

            {showProgress && (
                <button
                    disabled={true}
                    className="w-full py-4 bg-indigo-500 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-3 opacity-50"
                >
                    <span className="material-symbols-outlined text-2xl animate-spin">sync</span>
                    REGISTERING...
                </button>
            )}

            {enrollState === STATES.ERROR && (
                <div className="flex justify-center gap-4">
                    <button
                        onClick={handleRetry}
                        className="px-8 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-2"
                    >
                        <span className="material-symbols-outlined">restart_alt</span>
                        Start Over
                    </button>
                </div>
            )}

            {enrollState === STATES.SUCCESS && (
                <button
                    onClick={handleCompleteRegistration}
                    disabled={!data.patientId}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                    Complete Registration
                    <span className="material-symbols-outlined">check_circle</span>
                </button>
            )}

            {enrollState === STATES.SUCCESS && fingerId && (
                <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-2xl p-4 border border-emerald-200 dark:border-emerald-800">
                    <div className="flex items-center gap-3">
                        <div className="size-12 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-600/30">
                            <span className="material-symbols-outlined text-2xl">fingerprint</span>
                        </div>
                        <div className="flex-1">
                            <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-0.5">Fingerprint ID</p>
                            <p className="text-lg font-mono font-bold text-slate-800 dark:text-white">{fingerId}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="size-2.5 bg-emerald-500 rounded-full animate-pulse"></div>
                            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Enrolled</span>
                        </div>
                    </div>
                </div>
            )}

            <div className="pt-4">
                <button
                    onClick={goBack}
                    disabled={!canGoBack}
                    className="px-6 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <span className="material-symbols-outlined">arrow_back</span>
                    Back
                </button>
            </div>
        </div>
    );
}
