import mongoose from "mongoose";

const loginAuditSchema = new mongoose.Schema({
    phone: String,
    ip: String,
    userAgent: String,
    isNominee: {
        type: Boolean,
        default: false
    },
    nomineeName: String,
    patientName: String,
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Patient",
        default: null
    },
    status: {
        type: String,
        enum: [
            "OTP_SENT",
            "OTP_FAILED",
            "LOGIN_SUCCESS",
            "LOGIN_FAILED",
            "NOMINEE_OTP_SENT",
            "NOMINEE_VERIFY_FAILED",
            "NOMINEE_CONSENT_GRANTED"
        ]
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

loginAuditSchema.index({ phone: 1, createdAt: -1 });
loginAuditSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("LoginAudit", loginAuditSchema);
