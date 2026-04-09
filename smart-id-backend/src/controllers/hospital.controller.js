import Patient from '../models/Patient.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import Consent from '../models/Consent.js';
import Hospital from '../models/Hospital.js';
import { callHardwareBridge, normalizeHardwareStatus, pollHardwareBridge } from '../utils/hardwareGateway.js';
import { logAudit } from '../utils/auditLogger.js';

export const authenticateEmergencyManager = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ message: 'Password is required' });
    }

    const emergencyPassword = process.env.EMERGENCY_PASSWORD;

    if (emergencyPassword && password === emergencyPassword) {
      const user = await User.findById(req.user._id || req.user.id);

      await logAudit({
        actor: req.user._id || req.user.id,
        actorRole: req.user.role,
        action: 'EMERGENCY_ACCESS',
        resource: 'EMERGENCY_OVERRIDE',
        ipAddress: req.ip,
        targetType: 'emergency',
        targetName: 'Emergency override authenticated',
        metadata: {
          method: 'emergency_password'
        }
      });
      
      return res.json({
        allowed: true,
        authorized: true,
        method: 'emergency_password',
        user: user ? {
          id: user._id,
          name: user.name,
          role: user.role
        } : null
      });
    }

    const user = await User.findById(req.user._id || req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      await logAudit({
        actor: req.user._id || req.user.id,
        actorRole: req.user.role,
        action: 'EMERGENCY_ACCESS',
        resource: 'EMERGENCY_OVERRIDE',
        ipAddress: req.ip,
        outcome: 'FAILED',
        reason: 'Invalid password',
        targetType: 'emergency',
        targetName: 'Emergency override authentication'
      });

      return res.status(401).json({ message: 'Invalid password' });
    }

    await logAudit({
      actor: req.user._id || req.user.id,
      actorRole: req.user.role,
      action: 'EMERGENCY_ACCESS',
      resource: 'EMERGENCY_OVERRIDE',
      ipAddress: req.ip,
      targetType: 'emergency',
      targetName: 'Emergency override authenticated',
      metadata: {
        method: 'user_password'
      }
    });

    res.json({
      allowed: true,
      authorized: true,
      method: 'user_password',
      user: {
        id: user._id,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Emergency manager authentication error:', error);
    res.status(500).json({ message: 'Failed to validate emergency manager credentials' });
  }
};

export const verifyEmergencyNfcCard = async (req, res) => {
  try {
    const { patientId, expectedUid } = req.body || {};

    if (!patientId || !expectedUid) {
      return res.status(400).json({
        success: false,
        code: 'EMERGENCY_CONTEXT_REQUIRED',
        message: 'Patient session and expected NFC UID are required for emergency verification.'
      });
    }

    const patient = await Patient.findById(patientId).populate('user', 'name username role');

    if (!patient) {
      return res.status(404).json({
        success: false,
        code: 'PATIENT_NOT_FOUND',
        message: 'Patient not found for emergency verification.'
      });
    }

    const normalizedExpectedUid = `${expectedUid}`.trim();
    const patientUid = `${patient.nfcUuid || ''}`.trim();

    if (!patientUid) {
      return res.status(400).json({
        success: false,
        code: 'PATIENT_NFC_NOT_LINKED',
        message: 'This patient does not have a linked NFC card.'
      });
    }

    if (patientUid !== normalizedExpectedUid) {
      return res.status(400).json({
        success: false,
        code: 'EMERGENCY_CONTEXT_MISMATCH',
        message: 'The active patient session NFC UID does not match the stored patient card.'
      });
    }

    if (!process.env.HARDWARE_BRIDGE_URL) {
      await logAudit({
        actor: req.user._id || req.user.id,
        actorRole: req.user.role,
        action: 'EMERGENCY_NFC_VERIFY',
        patient: patient._id,
        resource: 'NFC_READER',
        ipAddress: req.ip,
        outcome: 'FAILED',
        reason: 'Hardware bridge not configured',
        targetType: 'patient',
        targetId: `${patient._id}`,
        targetName: patient.fullName,
        metadata: {
          expectedUid: normalizedExpectedUid
        }
      });

      return res.status(503).json({
        success: false,
        code: 'HARDWARE_NOT_CONFIGURED',
        message: 'NFC hardware bridge is not configured.'
      });
    }

    await logAudit({
      actor: req.user._id || req.user.id,
      actorRole: req.user.role,
      action: 'EMERGENCY_NFC_VERIFY',
      patient: patient._id,
      resource: 'NFC_READER',
      ipAddress: req.ip,
      targetType: 'patient',
      targetId: `${patient._id}`,
      targetName: patient.fullName,
      metadata: {
        phase: 'started',
        expectedUid: normalizedExpectedUid
      }
    });

    const scanResponse = await callHardwareBridge('/nfc/scan', {
      method: 'POST',
      body: {}
    });

    const pollResult = scanResponse?.operationId
      ? await pollHardwareBridge(scanResponse.operationId)
      : {
          success: true,
          nfcId: scanResponse?.uid || scanResponse?.nfcId
        };

    const scannedUid = `${pollResult?.nfcId || ''}`.trim();

    if (!scannedUid) {
      await logAudit({
        actor: req.user._id || req.user.id,
        actorRole: req.user.role,
        action: 'EMERGENCY_NFC_VERIFY',
        patient: patient._id,
        resource: 'NFC_READER',
        ipAddress: req.ip,
        outcome: 'FAILED',
        reason: 'No NFC card detected',
        targetType: 'patient',
        targetId: `${patient._id}`,
        targetName: patient.fullName,
        metadata: {
          expectedUid: normalizedExpectedUid
        }
      });

      return res.status(504).json({
        success: false,
        code: 'NFC_SCAN_TIMEOUT',
        message: 'No NFC card was detected. Please tap the patient card on the reader again.'
      });
    }

    if (scannedUid !== normalizedExpectedUid) {
      await logAudit({
        actor: req.user._id || req.user.id,
        actorRole: req.user.role,
        action: 'EMERGENCY_NFC_VERIFY',
        patient: patient._id,
        resource: 'NFC_READER',
        ipAddress: req.ip,
        outcome: 'DENIED',
        reason: 'Scanned card does not match emergency patient',
        targetType: 'patient',
        targetId: `${patient._id}`,
        targetName: patient.fullName,
        metadata: {
          expectedUid: normalizedExpectedUid,
          scannedUid
        }
      });

      return res.status(409).json({
        success: false,
        matched: false,
        code: 'NFC_UID_MISMATCH',
        message: 'The scanned NFC card does not belong to the active emergency patient.',
        scannedUid,
        expectedUid: normalizedExpectedUid
      });
    }

    await logAudit({
      actor: req.user._id || req.user.id,
      actorRole: req.user.role,
      action: 'EMERGENCY_NFC_VERIFY',
      patient: patient._id,
      resource: 'NFC_READER',
      ipAddress: req.ip,
      targetType: 'patient',
      targetId: `${patient._id}`,
      targetName: patient.fullName,
      metadata: {
        expectedUid: normalizedExpectedUid,
        scannedUid,
        phase: 'matched'
      }
    });

    return res.json({
      success: true,
      matched: true,
      code: 'EMERGENCY_NFC_VERIFIED',
      message: 'Patient card verified successfully.',
      scannedUid,
      expectedUid: normalizedExpectedUid,
      patient: {
        id: patient._id,
        name: patient.fullName,
        fullName: patient.fullName,
        healthId: patient.user?.username || patient.nfcUuid || 'Unknown',
        age: patient.age,
        gender: patient.gender,
        bloodGroup: patient.bloodGroup,
        phone: patient.phone,
        nfcId: patient.nfcUuid,
        nfcUuid: patient.nfcUuid,
        emergencyContact: patient.emergencyContact
      }
    });
  } catch (error) {
    console.error('Emergency NFC verification error:', error);

    const fallbackPatientId = req.body?.patientId || null;
    if (fallbackPatientId) {
      await logAudit({
        actor: req.user._id || req.user.id,
        actorRole: req.user.role,
        action: 'EMERGENCY_NFC_VERIFY',
        patient: fallbackPatientId,
        resource: 'NFC_READER',
        ipAddress: req.ip,
        outcome: 'FAILED',
        reason: error.message || 'Emergency NFC verification failed',
        targetType: 'patient',
        targetId: `${fallbackPatientId}`,
        metadata: {
          expectedUid: req.body?.expectedUid || null
        }
      });
    }

    return res.status(error.status || 500).json({
      success: false,
      code: error.status === 504 ? 'NFC_SCAN_TIMEOUT' : 'EMERGENCY_NFC_VERIFY_FAILED',
      message: error.message || 'Emergency NFC verification failed.'
    });
  }
};

// Get hospital dashboard statistics
export const getHospitalStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalPatients,
      todayAdmissions,
      activeConsents,
      emergencyAccessToday
    ] = await Promise.all([
      Patient.countDocuments(),
      AuditLog.countDocuments({
        action: 'PATIENT_REGISTER',
        createdAt: { $gte: today }
      }),
      Consent.countDocuments({ status: 'approved' }),
      AuditLog.countDocuments({
        action: { $regex: /emergency/i },
        createdAt: { $gte: today }
      })
    ]);

    // Calculate ER load based on recent activity
    const lastHour = new Date(Date.now() - 60 * 60 * 1000);
    const recentActivity = await AuditLog.countDocuments({
      createdAt: { $gte: lastHour }
    });

    // Estimated operational metrics derived from recent activity.
    const stats = {
      totalPatients,
      dailyAdmissions: todayAdmissions,
      erLoad: Math.min(100, Math.round((recentActivity / 10) * 100)),
      availableRooms: Math.max(0, 20 - (todayAdmissions % 20)),
      staffOnDuty: await User.countDocuments({ role: { $in: ['doctor', 'hospital'] } }),
      activeConsents,
      emergencyAccessToday
    };

    res.json(stats);
  } catch (error) {
    console.error('Hospital stats error:', error);
    res.status(500).json({ message: 'Failed to fetch hospital statistics' });
  }
};

// Get patient flow data for charts (real data aggregation)
export const getPatientFlow = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const result = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const count = await AuditLog.countDocuments({
        action: { $in: ['PATIENT_REGISTER', 'PATIENT_PROFILE_VIEW', 'NFC_SCAN'] },
        createdAt: { $gte: date, $lt: nextDate }
      });

      result.push({
        day: date.toLocaleDateString('en-US', { weekday: 'short' }),
        value: count
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Patient flow error:', error);
    res.status(500).json({ message: 'Failed to fetch patient flow data' });
  }
};

// Get recent hospital activity
export const getRecentActivity = async (req, res) => {
  try {
    const logs = await AuditLog.find()
      .populate('actor', 'name username role')
      .populate('patient', 'fullName')
      .sort({ createdAt: -1 })
      .limit(20);

    const activity = logs.map(log => ({
      id: log._id,
      action: log.action,
      user: log.actor?.name || log.actor?.username || 'System',
      target: log.patient?.fullName || log.resource || 'Unknown',
      timestamp: log.createdAt,
      role: log.actorRole
    }));

    res.json(activity);
  } catch (error) {
    console.error('Recent activity error:', error);
    res.status(500).json({ message: 'Failed to fetch recent activity' });
  }
};

// Get system health status
export const getSystemHealth = async (req, res) => {
  try {
    const dbHealth = await Patient.findOne().maxTimeMS(5000).then(() => 'healthy').catch(() => 'degraded');
    const bridgeHealth = await callHardwareBridge('/health').catch((error) => ({
      services: {
        nfc: 'error',
        fingerprint: 'error',
        gsm: 'error',
        pi: 'error'
      },
      api: 'online',
      database: dbHealth,
      lastCheck: new Date().toISOString(),
      error: error.message
    }));
    const normalized = normalizeHardwareStatus(bridgeHealth);

    const health = {
      database: dbHealth,
      api: normalized.api,
      lastCheck: normalized.lastCheck,
      services: {
        auth: 'online',
        nfc: normalized.nfc,
        fingerprint: normalized.fingerprint,
        gsm: normalized.gsm,
        raspberryPi: normalized.pi,
        storage: dbHealth
      },
      bridgeConfigured: normalized.bridgeConfigured
    };

    res.json(health);
    } catch (error) {
    res.status(500).json({ message: 'Failed to fetch system health' });
  }
};

export const getHospitals = async (req, res) => {
  try {
    const { scheme, city, type, emergency } = req.query;
    
    const filter = { active: true };
    
    if (scheme) {
      filter['empanelled.scheme'] = scheme;
      filter['empanelled.active'] = true;
    }
    
    if (city) {
      filter['address.city'] = { $regex: new RegExp(city, 'i') };
    }
    
    if (type) {
      filter.type = type;
    }
    
    if (emergency === 'true') {
      filter.emergencyServices = true;
    }

    const hospitals = await Hospital.find(filter)
      .select('name address city phone type specialty emergencyServices ambulanceService empanelled services facilities claimSuccessRate isGovernment hasEmergency bedCount')
      .lean();

    const formatted = hospitals.map(h => ({
      id: h._id,
      name: h.name,
      city: h.address?.city || 'Unknown',
      phone: h.phone,
      type: h.type,
      specialty: h.specialty || [],
      emergencyServices: h.emergencyServices,
      ambulanceService: h.ambulanceService,
      schemes: h.empanelled?.filter(e => e.active).map(e => e.scheme) || [],
      services: h.services || [],
      facilities: h.facilities || [],
      claimSuccessRate: h.claimSuccessRate || 85,
      isGovernment: h.isGovernment || h.type === 'government',
      hasEmergency: h.hasEmergency || h.emergencyServices,
      bedCount: h.bedCount || 0,
      distanceKm: 0
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Get hospitals error:', error);
    res.status(500).json({ message: 'Failed to fetch hospitals' });
  }
};

export const createHospital = async (req, res) => {
  try {
    const hospitalData = {
      ...req.body,
      user: req.user._id || req.user.id,
      isGovernment: req.body.type === 'government',
      hasEmergency: req.body.emergencyServices
    };

    const hospital = await Hospital.create(hospitalData);

    await logAudit({
      actor: req.user._id || req.user.id,
      actorRole: req.user.role,
      action: 'CREATE_HOSPITAL',
      resource: 'HOSPITAL_PROFILE',
      ipAddress: req.ip,
      targetType: 'hospital',
      targetId: `${hospital._id}`,
      targetName: hospital.name
    });

    res.status(201).json({
      message: 'Hospital registered successfully',
      hospital: hospital.toPublicJSON()
    });
  } catch (error) {
    console.error('Create hospital error:', error);
    res.status(500).json({ message: 'Failed to create hospital' });
  }
};

export const getHospitalById = async (req, res) => {
  try {
    const hospital = await Hospital.findById(req.params.id).lean();

    if (!hospital) {
      return res.status(404).json({ message: 'Hospital not found' });
    }

    res.json(hospital.toPublicJSON ? hospital.toPublicJSON() : hospital);
  } catch (error) {
    console.error('Get hospital error:', error);
    res.status(500).json({ message: 'Failed to fetch hospital' });
  }
};

export const getAvailableSchemes = async (req, res) => {
  try {
    const schemes = Hospital.getSchemes();
    const schemeDetails = {
      CMCHIS: { name: 'CMCHIS', description: 'Chief Minister\'s Comprehensive Health Insurance', type: 'government' },
      PMJAY: { name: 'Ayushman Bharat PM-JAY', description: 'National Health Protection Scheme', type: 'government' },
      TN_UHS: { name: 'TN UHS', description: 'Tamil Nadu Urban Health Scheme', type: 'government' },
      STAR_HEALTH: { name: 'Star Health', description: 'Private Health Insurance', type: 'private' },
      HDFC_ERGO: { name: 'HDFC ERGO', description: 'HDFC ERGO Health Insurance', type: 'private' },
      ICICI_LOMBARD: { name: 'ICICI Lombard', description: 'ICICI Lombard Health Insurance', type: 'private' },
      OTHER: { name: 'Other Schemes', description: 'Other Insurance Schemes', type: 'other' }
    };

    res.json(schemes.map(code => ({
      code,
      ...schemeDetails[code]
    })));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch schemes' });
  }
};
