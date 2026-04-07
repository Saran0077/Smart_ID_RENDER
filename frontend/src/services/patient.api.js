import api from "./api";

const patientApi = {
    getProfile: async () => {
        const res = await api.get("/patient/profile");
        return res.data;
    },
    getMedicalRecords: async () => {
        const res = await api.get("/patient/records");
        return res.data;
    },
    getPatientEMR: async () => {
        const res = await api.get("/patient/emr");
        return res.data;
    },
    getPrescriptions: async () => {
        const res = await api.get("/patient/prescriptions");
        return res.data;
    },
    getPatientAuditLog: async () => {
        const res = await api.get("/audit/my");
        return res.data;
    },
    sendOtp: async (phone) => {
        const res = await api.post("/otp/send-otp", { phone }, { timeout: 45000 });
        return res.data;
    },
    verifyOtp: async (phone, otp, idToken) => {
        const res = await api.post("/otp/verify-otp", { phone, otp, idToken });
        return res.data;
    },
    exportProfilePDF: async () => {
        const res = await api.get("/patient/export/profile/pdf", { responseType: "blob" });
        return res.data;
    },
    exportMedicalHistoryPDF: async () => {
        const res = await api.get("/patient/export/history/pdf", { responseType: "blob" });
        return res.data;
    }
};

export default patientApi;
