import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";
import { checkPermission } from "../middleware/permission.middleware.js";
import { allowHardwareBridgeOrAuthenticatedUser, verifyHardwareBridge } from "../middleware/hardwareBridge.middleware.js";
import Patient from "../models/Patient.js";
import { 
    handleNfcScan, 
    linkNfcCard,
    verifyFingerprint, 
    scanFingerprint,
    generateHardwareOtp,
    getPatientByNfc,
    enrollFingerprint,
    startFingerprintEnrollment,
    getFingerprintEnrollmentStatus,
    completeFingerprintEnrollment,
    cancelFingerprintEnrollment,
    deleteEnrolledFingerprint
} from "../controllers/nfc.controller.js";

const router = express.Router();
const methodNotAllowed = (allowedMethods) => (_req, res) => {
  res.setHeader("Allow", allowedMethods.join(", "));
  return res.status(405).json({
    error: "Method not allowed",
    allowedMethods
  });
};

// ==========================================
// 🔴 HARDWARE INTEGRATION ROUTES (Raspberry Pi)
// These routes require hardware bridge authentication
// All requests must include: x-hardware-key: <BRIDGE_KEY>
// ==========================================

// 1️⃣ Raspberry Pi posts NFC UID
router.post(
  "/scan",
  allowHardwareBridgeOrAuthenticatedUser(),
  (req, res, next) => {
    if (req.hardwareBridge) return next();
    return protect(req, res, next);
  },
  (req, res, next) => {
    if (req.hardwareBridge) return next();
    return authorizeRoles("doctor", "hospital", "medical_shop")(req, res, next);
  },
  handleNfcScan
);

// 1️⃣ B️⃣ Link NFC Card (for patient registration)
router.post(
  "/link-card",
  allowHardwareBridgeOrAuthenticatedUser(),
  (req, res, next) => {
    if (req.hardwareBridge) return next();
    return protect(req, res, next);
  },
  (req, res, next) => {
    if (req.hardwareBridge) return next();
    return authorizeRoles("hospital")(req, res, next);
  },
  linkNfcCard
);

// 2️⃣ Raspberry Pi posts Fingerprint matches
router.post(
  "/fingerprint",
  allowHardwareBridgeOrAuthenticatedUser(),
  (req, res, next) => {
    if (req.hardwareBridge) return next();
    return protect(req, res, next);
  },
  (req, res, next) => {
    if (req.hardwareBridge) return next();
    return authorizeRoles("doctor", "hospital")(req, res, next);
  },
  verifyFingerprint
);

// 3️⃣ Raspberry Pi requests OTP to send via SIM800L
router.post("/generate-otp", verifyHardwareBridge, generateHardwareOtp);

// ==========================================
// 🟢 FINGERPRINT ENROLLMENT (Frontend → Hospital Staff)
// These routes use user authentication, not hardware bridge
// ==========================================

router.post(
  "/scan-fingerprint",
  protect,
  authorizeRoles("hospital"),
  scanFingerprint
);

router.post(
  "/enroll",
  protect,
  authorizeRoles("hospital"),
  enrollFingerprint
);

router.post(
  "/enroll-start",
  protect,
  authorizeRoles("hospital"),
  startFingerprintEnrollment
);
router.get("/enroll-start", methodNotAllowed(["POST"]));

router.get(
  "/enroll-status",
  protect,
  authorizeRoles("hospital"),
  getFingerprintEnrollmentStatus
);

router.post(
  "/enroll-complete",
  protect,
  authorizeRoles("hospital"),
  completeFingerprintEnrollment
);
router.get("/enroll-complete", methodNotAllowed(["POST"]));

router.post(
  "/enroll-cancel",
  protect,
  authorizeRoles("hospital"),
  cancelFingerprintEnrollment
);
router.get("/enroll-cancel", methodNotAllowed(["POST"]));

router.delete(
  "/fingerprint/:fingerprintId",
  protect,
  authorizeRoles("hospital", "admin"),
  deleteEnrolledFingerprint
);


// ==========================================
// 🔵 FRONTEND ROUTES (User/Doctor interactions)
// ==========================================

// 🏥 Scan NFC (Simplified/Auth version for demo dashboards)
router.get("/patients/nfc/:id", protect, checkPermission('patient_search'), async (req, res) => {
    try {
        const patient = await Patient.findOne({ nfcUuid: req.params.id })
            .populate('user', 'name username');
            
        if (!patient) return res.status(404).json({ message: "Patient not found" });

        res.json({
            id: req.params.id,
            name: patient.fullName || "Unknown",
            age: patient.age,
            gender: patient.gender,
            phone: patient.phone,
            condition: "Cardiology Consultation",
            time: new Date().toLocaleString()
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
});

// Primary lookup route via GET
router.get("/patient/:nfcId", protect, checkPermission('patient_search'), getPatientByNfc);

export default router;
