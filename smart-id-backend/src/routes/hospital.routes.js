import express from 'express';
import {
  getHospitalStats,
  getPatientFlow,
  getRecentActivity,
  getSystemHealth,
  authenticateEmergencyManager,
  verifyEmergencyNfcCard,
  getHospitals,
  createHospital,
  getHospitalById,
  getAvailableSchemes
} from '../controllers/hospital.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';
import { checkPermission } from '../middleware/permission.middleware.js';

const router = express.Router();

// ==========================================
// PUBLIC ROUTES - No authentication required
// These are for patient self-service and public hospital directory
// ==========================================

router.get('/hospitals', getHospitals);
router.get('/schemes', getAvailableSchemes);

// ==========================================
// PROTECTED ROUTES - Require authentication
// ==========================================

router.use(protect);

// Hospital dashboard statistics
router.get('/stats', authorizeRoles('hospital'), getHospitalStats);

// Patient flow data for charts
router.get('/patient-flow', authorizeRoles('hospital', 'admin'), getPatientFlow);

// Recent hospital activity
router.get('/activity', authorizeRoles('hospital'), getRecentActivity);

// System health status
router.get('/health', authorizeRoles('hospital', 'admin'), getSystemHealth);

// Emergency authentication - needs emergency_bypass permission
router.post('/emergency/auth', authorizeRoles('hospital', 'admin'), checkPermission('emergency_bypass'), authenticateEmergencyManager);
router.post('/emergency/verify-card', authorizeRoles('hospital', 'admin'), checkPermission('emergency_bypass'), verifyEmergencyNfcCard);

// Hospital management
router.post('/', authorizeRoles('admin', 'hospital'), createHospital);
router.get('/:id', authorizeRoles('admin', 'hospital'), getHospitalById);

export default router;
