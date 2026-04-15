import { createContext, useContext, useState, useCallback } from "react";

const SessionContext = createContext(null);

export const SessionProvider = ({ children }) => {
    const [patient, setPatientState] = useState(null);
    const [otpVerified, setOtpVerified] = useState(false);
    const [authMethod, setAuthMethod] = useState(null); // "PATIENT" | "NOMINEE"
    const [fingerprintVerified, setFingerprintVerified] = useState(false);
    const [sessionStartedAt, setSessionStartedAt] = useState(null);
    
    // Nominee information
    const [nomineeInfo, setNomineeInfo] = useState(null); // { name, phone }

    // Emergency Override State
    const [emergencyMode, setEmergencyMode] = useState(false);
    const [emergencyBy, setEmergencyBy] = useState(null);
    const [emergencyReason, setEmergencyReason] = useState(null);

    const syncNomineeInfo = useCallback((patientData) => {
        if (patientData?.emergencyContact) {
            setNomineeInfo({
                name: patientData.emergencyContact.name || null,
                phone: patientData.emergencyContact.phone || null
            });
            return;
        }

        setNomineeInfo(null);
    }, []);

    const startSession = useCallback((patientData) => {
        setPatientState(patientData);
        setOtpVerified(false);
        setAuthMethod(null);
        setFingerprintVerified(false);
        setEmergencyMode(false);
        setEmergencyBy(null);
        setEmergencyReason(null);
        setSessionStartedAt(new Date().toISOString());
        syncNomineeInfo(patientData);
    }, [syncNomineeInfo]);

    const mergePatientData = useCallback((patientData) => {
        setPatientState((currentPatient) => {
            const mergedPatient = {
                ...(currentPatient || {}),
                ...(patientData || {}),
                emergencyContact: patientData?.emergencyContact || currentPatient?.emergencyContact || null
            };

            syncNomineeInfo(mergedPatient);
            return mergedPatient;
        });
    }, [syncNomineeInfo]);

    const resetSession = useCallback(() => {
        setPatientState(null);
        setOtpVerified(false);
        setAuthMethod(null);
        setFingerprintVerified(false);
        setEmergencyMode(false);
        setEmergencyBy(null);
        setEmergencyReason(null);
        setSessionStartedAt(null);
        setNomineeInfo(null);
    }, []);

    return (
        <SessionContext.Provider value={{
            patient,
            setPatient: startSession,
            mergePatientData,
            otpVerified,
            setOtpVerified,
            authMethod,
            setAuthMethod,
            fingerprintVerified,
            setFingerprintVerified,
            nomineeInfo,
            setNomineeInfo,
            emergencyMode,
            setEmergencyMode,
            emergencyBy,
            setEmergencyBy,
            emergencyReason,
            setEmergencyReason,
            sessionStartedAt,
            resetSession
        }}>
            {children}
        </SessionContext.Provider>
    );
};

export const useSession = () => {
    const context = useContext(SessionContext);
    if (!context) {
        throw new Error("useSession must be used within a SessionProvider");
    }
    return context;
};
