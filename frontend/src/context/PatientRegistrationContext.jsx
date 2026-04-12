import { createContext, useContext, useEffect, useMemo, useState } from "react";

const PatientRegistrationContext = createContext();

const STORAGE_KEY = "smart-id-patient-registration-draft";

const defaultRegistrationState = {
    personal: {},
    contact: {},
    medical: {},
    nfcId: null,
    patientId: null,
    fingerprintId: null,
    registrationResult: null,
    completedSteps: {
        personal: false,
        contact: false,
        medical: false,
        fingerprint: false,
    },
};

const loadInitialState = () => {
    if (typeof window === "undefined") {
        return defaultRegistrationState;
    }

    try {
        const storedDraft = window.sessionStorage.getItem(STORAGE_KEY);
        if (!storedDraft) {
            return defaultRegistrationState;
        }

        const parsedDraft = JSON.parse(storedDraft);
        return {
            ...defaultRegistrationState,
            ...parsedDraft,
            completedSteps: {
                ...defaultRegistrationState.completedSteps,
                ...parsedDraft.completedSteps,
            },
        };
    } catch (error) {
        console.warn("Unable to restore patient registration draft:", error);
        return defaultRegistrationState;
    }
};

const stepRoutes = {
    personal: "/hospital/register",
    contact: "/hospital/register/contact",
    medical: "/hospital/register/medical",
    fingerprint: "/hospital/register/fingerprint",
};

export function PatientRegistrationProvider({ children }) {
    const [data, setData] = useState(loadInitialState);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }, [data]);

    const updateSection = (section, values) =>
        setData((prev) => ({
            ...prev,
            [section]: {
                ...(prev[section] || {}),
                ...values,
            },
        }));

    const updateValue = (field, value) =>
        setData((prev) => ({
            ...prev,
            [field]: value,
        }));

    const markStepComplete = (step, isComplete = true) =>
        setData((prev) => ({
            ...prev,
            completedSteps: {
                ...prev.completedSteps,
                [step]: isComplete,
            },
        }));

    const clearDraft = () => {
        if (typeof window !== "undefined") {
            window.sessionStorage.removeItem(STORAGE_KEY);
        }

        setData(defaultRegistrationState);
    };

    const getFirstIncompleteStepPath = () => {
        if (!data.completedSteps.personal) return stepRoutes.personal;
        if (!data.completedSteps.contact) return stepRoutes.contact;
        if (!data.completedSteps.medical) return stepRoutes.medical;
        return stepRoutes.fingerprint;
    };

    const canAccessStep = (step) => {
        switch (step) {
            case "personal":
                return true;
            case "contact":
                return data.completedSteps.personal;
            case "medical":
                return data.completedSteps.personal && data.completedSteps.contact;
            case "fingerprint":
                return (
                    data.completedSteps.personal &&
                    data.completedSteps.contact &&
                    data.completedSteps.medical &&
                    Boolean(data.nfcId)
                );
            default:
                return false;
        }
    };

    const value = useMemo(() => ({
        data,
        updateSection,
        updateValue,
        markStepComplete,
        clearDraft,
        getFirstIncompleteStepPath,
        canAccessStep,
    }), [data]);

    return (
        <PatientRegistrationContext.Provider value={value}>
            {children}
        </PatientRegistrationContext.Provider>
    );
}

export const usePatientRegistration = () =>
    useContext(PatientRegistrationContext);
