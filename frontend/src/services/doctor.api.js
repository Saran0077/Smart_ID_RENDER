import api, { apiNfc } from "./api";

const doctorApi = {
    // Get doctor dashboard statistics
    getStats: async () => {
        const res = await api.get("/doctor/stats");
        return res.data;
    },

    // NFC Scan (Trigger or check last)
    scanNfc: async () => {
        const res = await apiNfc.post("/nfc/scan", {});
        return res.data;
    },

    // Fingerprint Verify
    verifyFingerprint: async (payload = {}) => {
        const res = await api.post("/nfc/fingerprint", payload);
        return res.data;
    },

    // OTP Send
    sendOtp: async (phone) => {
        const res = await api.post("/otp/send-otp", { phone });
        return res.data;
    },

    // OTP Verify
    verifyOtp: async (payload) => {
        const res = await api.post("/otp/verify-otp", payload);
        return res.data;
    },

    // Fetch patient data by NFC UID
    getPatientByUid: async (uid) => {
        const res = await api.get(`/doctor/patient/${uid}`);
        return res.data;
    },

    // Get recent patients
    getRecentPatients: async () => {
        const res = await api.get("/doctor/recent-patients");
        return res.data;
    },

    // Get device status
    getDeviceStatus: async () => {
        const res = await api.get("/doctor/device-status");
        return res.data;
    },

    // Get doctor's audit history
    getHistory: async () => {
        const res = await api.get("/audit/my");
        return res.data;
    },

    closePatientSession: async (patientId) => {
        const res = await api.post("/doctor/close-session", { patientId });
        return res.data;
    },

    createClinicalNote: async (patientId, payload) => {
        const res = await api.post(`/patient/${patientId}/notes`, payload);
        return res.data;
    }
};

export default doctorApi;
