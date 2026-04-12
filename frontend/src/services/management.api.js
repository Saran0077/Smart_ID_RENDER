import api, { apiNfc } from "./api";

// Clinical workflow API - for patient session, OTP, biometrics, and clinical notes
const managementApi = {
    // Patient Registration
    registerPatient: async (payload) => {
        const res = await api.post("/patient/register", payload);
        return res.data;
    },
    validatePatientRegistration: async (payload) => {
        const res = await api.post("/patient/register/validate", payload);
        return res.data;
    },

    // Patient Session & NFC
    getPatientByNfc: async (nfcId) => {
        const res = await api.get(`/nfc/patient/${nfcId}`);
        return res.data;
    },
    scanNfc: async (uid) => {
        const res = await apiNfc.post("/nfc/scan", uid ? { uid } : {});
        return res.data;
    },
    linkCard: async () => {
        const res = await apiNfc.post("/nfc/link-card", {});
        return res.data;
    },

    // OTP Consent flow - Patient OTP
    sendOtp: async (phone, patientId) => {
        const res = await api.post("/otp/send-otp", { 
            phone,
            purpose: 'consent',
            isNominee: false,
            patientId 
        }, { timeout: 45000 });
        return res.data;
    },
    
    // OTP Consent flow - Nominee OTP
    sendNomineeOtp: async (phone, patientId) => {
        const res = await api.post("/otp/send-otp", { 
            phone,
            purpose: 'consent',
            isNominee: true,
            patientId 
        }, { timeout: 45000 });
        return res.data;
    },
    
    // Verify OTP - Patient
    verifyOtp: async (phone, otp, patientId) => {
        const res = await api.post("/otp/verify-otp", { 
            phone, 
            otp,
            purpose: 'consent',
            isNominee: false,
            patientId 
        });
        return res.data;
    },
    
    // Verify OTP - Nominee
    verifyNomineeOtp: async (phone, otp, patientId) => {
        const res = await api.post("/otp/verify-otp", { 
            phone, 
            otp,
            purpose: 'consent',
            isNominee: true,
            patientId 
        });
        return res.data;
    },
    
    // Resend OTP based on consent type
    resendOtp: async (phone, patientId, isNominee = false) => {
        const res = await api.post("/otp/send-otp", { 
            phone,
            purpose: 'consent',
            isNominee,
            patientId 
        }, { timeout: 45000 });
        return res.data;
    },

    // Biometric Verification
    verifyBiometric: async (payload) => {
        const res = await api.post("/nfc/fingerprint", payload);
        return res.data;
    },

    // Fingerprint Scan (for enrollment)
    scanFingerprint: async (patientId, scanNumber) => {
        const res = await api.post("/nfc/scan-fingerprint", { patientId, scanNumber });
        return res.data;
    },

    enrollFingerprint: async (patientId) => {
        const res = await apiNfc.post("/nfc/enroll", { patientId });
        return res.data;
    },

    startFingerprintEnrollment: async () => {
        const res = await apiNfc.post("/nfc/enroll-start", {});
        return res.data;
    },

    getFingerprintEnrollmentStatus: async (operationId) => {
        const res = await apiNfc.get(`/nfc/enroll-status?operationId=${operationId}`);
        return res.data;
    },

    completeFingerprintEnrollment: async () => {
        const res = await apiNfc.post("/nfc/enroll-complete", {});
        return res.data;
    },

    cancelFingerprintEnrollment: async () => {
        const res = await apiNfc.post("/nfc/enroll-cancel", {});
        return res.data;
    },

    deleteEnrolledFingerprint: async (fingerprintId) => {
        const res = await apiNfc.delete(`/nfc/fingerprint/${fingerprintId}`);
        return res.data;
    },

    // Emergency Override
    authenticateEmergencyManager: async (credentials) => {
        const res = await api.post("/hospital/emergency/auth", credentials);
        return res.data;
    },
    verifyEmergencyCard: async (payload) => {
        const res = await api.post("/hospital/emergency/verify-card", payload, { timeout: 45000 });
        return res.data;
    },

    // Clinical Records
    createEmr: async (payload) => {
        const res = await api.post(`/patient/${payload.patientId}/notes`, payload);
        return res.data;
    },
    
    // Get Patient Full Details (for nominee info)
    getPatientDetails: async (patientId) => {
        const res = await api.get(`/patient/${patientId}/view`);
        return res.data;
    },
};

export default managementApi;
