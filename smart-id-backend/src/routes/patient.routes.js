import express from 'express';
import { logAudit } from '../utils/auditLogger.js';
import {
  createPatientProfile,
  getMyPatientProfile,
  updateMyPatientProfile,
  registerPatientByHospital,
  getMyPatientEMR,
  getMyPatientRecords,
  getMyPatientPrescriptions,
  addClinicalNote,
  exportPatientPDF,
  exportMedicalHistoryPDF
} from '../controllers/patient.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';
import { checkPermission } from '../middleware/permission.middleware.js';
import { checkConsent } from '../middleware/consent.middleware.js';
import Patient from '../models/Patient.js';

const router = express.Router();

// ===============================
// PATIENT SELF-SERVICE ROUTES
// ===============================

// 🟢 Create patient profile (Patient only)
router.post(
  '/register',
  protect,
  authorizeRoles('hospital'),
  checkPermission('patient_register'),
  registerPatientByHospital
);

router.post(
  '/profile',
  protect,
  authorizeRoles('patient'),
  createPatientProfile
);

// 🔵 Get own patient profile (Patient only)
router.get(
  '/profile',
  protect,
  authorizeRoles('patient'),
  getMyPatientProfile
);

router.get(
  '/records',
  protect,
  authorizeRoles('patient'),
  getMyPatientRecords
);

router.get(
  '/emr',
  protect,
  authorizeRoles('patient'),
  getMyPatientEMR
);

router.get(
  '/prescriptions',
  protect,
  authorizeRoles('patient'),
  checkPermission('prescription_view'),
  getMyPatientPrescriptions
);

// 🟡 Update own patient profile (Patient only)
router.put(
  '/profile',
  protect,
  authorizeRoles('patient'),
  updateMyPatientProfile
);

// ===============================
// DOCTOR / HOSPITAL ACCESS (WITH CONSENT)
// ===============================

// 🧑‍⚕️ / 🏥 View patient profile with valid consent
router.get(
  '/:patientId/view',
  protect,
  authorizeRoles('doctor', 'hospital'),
  checkPermission('identity_view'),
  checkConsent,
  async (req, res) => {
    try {
      const patient = await Patient.findById(req.params.patientId)
        .populate('user', 'name username role');

      if (!patient) {
        return res.status(404).json({ message: 'Patient not found' });
      }

      await logAudit({
        actor: req.user._id,
        actorRole: req.user.role,
        action: 'PATIENT_PROFILE_VIEW',
        patient: patient._id,
        resource: 'PATIENT_PROFILE',
        ipAddress: req.ip,
        targetType: 'patient',
        targetId: `${patient._id}`,
        targetName: patient.fullName
      });

      res.json(patient);
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: 'Server error while fetching patient profile'
      });
    }
  }
);

router.post(
  '/:patientId/notes',
  protect,
  authorizeRoles('doctor', 'hospital', 'admin'),
  checkPermission('emr_write'),
  addClinicalNote
);

// PDF Export Routes
router.get(
  '/export/profile/pdf',
  protect,
  authorizeRoles('patient'),
  exportPatientPDF
);

router.get(
  '/export/history/pdf',
  protect,
  authorizeRoles('patient'),
  exportMedicalHistoryPDF
);

// ===============================
// NFC DIRECT GET ROUTE (Protected)
// ===============================

// Get patient via NFC UID - Requires authentication
router.get(
  '/:uid',
  protect,
  authorizeRoles('hospital', 'doctor', 'admin'),
  async (req, res) => {
    try {
      const patient = await Patient.findOne({
        nfcUuid: req.params.uid
      });
      
      if (!patient) {
        return res.status(404).json({ message: 'Patient not found' });
      }

      await logAudit({
        actor: req.user._id,
        actorRole: req.user.role,
        action: 'PATIENT_PROFILE_VIEW',
        patient: patient._id,
        resource: 'PATIENT_PROFILE',
        ipAddress: req.ip,
        targetType: 'patient',
        targetId: `${patient._id}`,
        targetName: patient.fullName,
        metadata: {
          accessMode: 'nfc-direct'
        }
      });
      
      res.json(patient);
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: 'Server error while fetching NFC profile'
      });
    }
  }
);

export default router;
