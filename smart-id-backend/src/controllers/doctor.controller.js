import Patient from '../models/Patient.js';
import AuditLog from '../models/AuditLog.js';
import Consent from '../models/Consent.js';
import {
  callHardwareBridge,
  normalizeHardwareStatus,
  isHardwareBridgeConfigured
} from '../utils/hardwareGateway.js';
import { logAudit } from '../utils/auditLogger.js';

// Get doctor dashboard statistics
export const getDoctorStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalPatients,
      todayConsultations,
      pendingConsents,
      emergencyAccessToday
    ] = await Promise.all([
      Patient.countDocuments(),
      AuditLog.countDocuments({
        actor: req.user._id,
        action: 'PATIENT_PROFILE_VIEW',
        createdAt: { $gte: today }
      }),
      Consent.countDocuments({
        status: 'pending',
        requester: req.user.id
      }),
      AuditLog.countDocuments({
        actor: req.user._id,
        action: { $regex: /emergency/i },
        createdAt: { $gte: today }
      })
    ]);

    const stats = {
      totalPatients,
      todayConsultations,
      pendingConsents,
      emergencyAccessToday,
      lastActive: new Date()
    };

    res.json(stats);
  } catch (error) {
    console.error('Doctor stats error:', error);
    res.status(500).json({ message: 'Failed to fetch doctor statistics' });
  }
};

// Get patient by NFC UID with full medical data
export const getPatientByNfc = async (req, res) => {
  try {
    const { uid } = req.params;

    if (!uid) {
      return res.status(400).json({ message: 'NFC UID is required' });
    }

    console.log('Doctor looking up patient with NFC UID:', uid);

    const patient = await Patient.findOne({ nfcUuid: uid })
      .populate('user', 'name username role')
      .lean();

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found with this NFC card' });
    }

    // Safely access user data
    const healthId = patient.user?.username || patient.nfcUuid || 'Unknown';

    // Log the access - with null check
    if (req.user?._id) {
      await logAudit({
        actor: req.user._id,
        actorRole: req.user.role,
        action: 'NFC_SCAN',
        patient: patient._id,
        resource: 'PATIENT_PROFILE',
        ipAddress: req.ip,
        targetType: 'patient',
        targetId: `${patient._id}`,
        targetName: patient.fullName,
        metadata: {
          nfcId: patient.nfcUuid
        }
      });
    }

    res.json({
      id: patient._id,
      healthId,
      name: patient.fullName,
      phone: patient.phone,
      age: patient.age,
      gender: patient.gender,
      bloodGroup: patient.bloodGroup,
      allergies: patient.allergies,
      emergencyContact: patient.emergencyContact,
      medicalHistory: patient.medicalHistory,
      nfcId: patient.nfcUuid
    });
  } catch (error) {
    console.error('Get patient by NFC error:', error);
    res.status(500).json({ message: 'Failed to fetch patient data' });
  }
};

// Get doctor's recent patients
export const getRecentPatients = async (req, res) => {
  try {
    const logs = await AuditLog.find({
      actor: req.user._id,
      action: 'PATIENT_PROFILE_VIEW'
    })
      .populate('patient')
      .sort({ createdAt: -1 })
      .limit(10);

    const patients = logs
      .filter(log => log.patient)
      .map(log => ({
        id: log.patient._id,
        name: log.patient.fullName,
        lastVisit: log.createdAt,
        condition: log.patient.medicalHistory?.[0]?.condition || 'General'
      }));

    res.json(patients);
  } catch (error) {
    console.error('Recent patients error:', error);
    res.status(500).json({ message: 'Failed to fetch recent patients' });
  }
};

// Get device/hardware status
export const getDeviceStatus = async (req, res) => {
  try {
    const bridgeStatus = await callHardwareBridge('/health').catch((error) => ({
      services: {
        nfc: 'error',
        fingerprint: 'error',
        gsm: 'error',
        pi: 'error'
      },
      api: 'online',
      database: 'unknown',
      lastCheck: new Date().toISOString(),
      error: error.message
    }));

    const status = {
      ...normalizeHardwareStatus(bridgeStatus),
      uptime: process.uptime(),
      bridgeConfigured: isHardwareBridgeConfigured(),
      mode: isHardwareBridgeConfigured() ? 'hardware-bridge' : 'manual-fallback'
    };

    res.json(status);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch device status' });
  }
};
