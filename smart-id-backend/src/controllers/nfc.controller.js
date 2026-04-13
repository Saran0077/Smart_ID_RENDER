import Patient from '../models/Patient.js';
import Otp from '../models/Otp.js';
import { callHardwareBridge, isHardwareBridgeConfigured, pollHardwareBridge, pollHardwareBridgeForLink } from '../utils/hardwareGateway.js';
import { logAudit } from '../utils/auditLogger.js';

const extractFingerprintId = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  return (
    payload.fingerprintId ||
    payload.fingerId ||
    payload.finger_id ||
    payload.enrollment?.fingerprintId ||
    payload.enrollment?.fingerId ||
    payload.enrollment?.finger_id ||
    null
  );
};

// 1️⃣ Handle NFC Card Tap (from Raspberry Pi)
export const handleNfcScan = async (req, res) => {
  try {
    let { uid } = req.body;

    if (!uid && isHardwareBridgeConfigured()) {
      const scanResponse = await callHardwareBridge('/nfc/scan', {
        method: 'POST',
        body: req.body
      });
      
      if (scanResponse?.operationId) {
        console.log('NFC scan operation started:', scanResponse.operationId, 'Polling for result...');
        const pollResult = await pollHardwareBridge(scanResponse.operationId);
        uid = pollResult?.nfcId;
      } else {
        uid = scanResponse?.uid || scanResponse?.nfcId;
      }
    }

    if (!uid) {
      if (!isHardwareBridgeConfigured()) {
        return res.status(503).json({ message: 'Hardware bridge not configured. Please set HARDWARE_BRIDGE_URL.' });
      }
      return res.status(400).json({ message: 'NFC UID is required' });
    }

    console.log('NFC UID received:', uid);

    const patient = await Patient.findOne({ nfcUuid: String(uid) })
      .populate('user', 'name username role');

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found for this NFC card' });
    }

    res.json({
      success: true,
      message: 'Patient retrieved successfully',
      uid,
      patient: {
        id: patient._id,
        name: patient.fullName,
        healthId: patient.user?.username || patient.nfcUuid || "Unknown",
        age: patient.age,
        gender: patient.gender,
        bloodGroup: patient.bloodGroup,
        phone: patient.phone,
        nfcId: patient.nfcUuid
      }
    });

  } catch (error) {
    console.error('Error during NFC scan:', error);
    res.status(error.status || 500).json({ message: error.message || 'NFC scan lookup failed' });
  }
};

// 1️⃣ B️⃣ Link NFC Card (for patient registration - returns UID without patient lookup)
export const linkNfcCard = async (req, res) => {
  try {
    let { uid } = req.body;

    if (!uid && isHardwareBridgeConfigured()) {
      const scanResponse = await callHardwareBridge('/nfc/link-card', {
        method: 'POST',
        body: req.body
      });
      
      if (scanResponse?.operationId) {
        console.log('NFC link operation started:', scanResponse.operationId, 'Polling for result...');
        const pollResult = await pollHardwareBridgeForLink(scanResponse.operationId);
        uid = pollResult?.uid || pollResult?.nfcId;
      } else {
        uid = scanResponse?.uid || scanResponse?.nfcId;
      }
    }

    if (!uid) {
      if (!isHardwareBridgeConfigured()) {
        return res.status(503).json({ message: 'Hardware bridge not configured. Please set HARDWARE_BRIDGE_URL.' });
      }
      return res.status(400).json({ message: 'NFC UID is required' });
    }

    console.log('NFC UID for linking:', uid);

    const existingPatient = await Patient.findOne({ nfcUuid: uid });
    if (existingPatient) {
      return res.status(409).json({
        success: false,
        message: 'This NFC card is already linked to another patient',
        existingPatient: {
          name: existingPatient.fullName,
          phone: existingPatient.phone
        }
      });
    }

    res.json({
      success: true,
      uid,
      message: 'NFC card UID retrieved and available for linking'
    });

  } catch (error) {
    console.error('Error linking NFC card:', error);
    res.status(error.status || 500).json({ message: error.message || 'Failed to link NFC card' });
  }
};

// 2️⃣ Verify Fingerprint (from Raspberry Pi)
export const verifyFingerprint = async (req, res) => {
  try {
    const { finger_id, patientId, uid } = req.body;

    if (isHardwareBridgeConfigured()) {
      const hardwareResponse = await callHardwareBridge('/fingerprint/verify', {
        method: 'POST',
        body: req.body
      });

      return res.json({
        success: Boolean(hardwareResponse?.verified),
        verified: Boolean(hardwareResponse?.verified),
        patientId: hardwareResponse?.patientId || patientId || null,
        fingerId: hardwareResponse?.fingerId || hardwareResponse?.finger_id || null,
        uid: hardwareResponse?.uid || uid || null,
        message: hardwareResponse?.message || 'Fingerprint verification completed'
      });
    }

    if (finger_id === undefined) {
      return res.status(400).json({ message: 'Fingerprint ID is required when no hardware bridge is configured' });
    }

    const patientQuery = patientId
      ? { _id: patientId, fingerprintId: finger_id }
      : { fingerprintId: finger_id };

    const patient = await Patient.findOne(patientQuery);

    if (!patient) {
      return res.status(401).json({ message: 'Fingerprint does not match any patient' });
    }

    res.json({
      success: true,
      verified: true,
      message: 'Fingerprint verified successfully',
      patientId: patient._id,
      patientName: patient.fullName
    });

  } catch (error) {
    console.error('Error verifying fingerprint:', error);
    res.status(error.status || 500).json({ message: error.message || 'Fingerprint verification failed' });
  }
};

// 2️⃣ B️⃣ Scan Fingerprint (for enrollment - single scan)
export const scanFingerprint = async (req, res) => {
  try {
    const { patientId, scanNumber } = req.body;

    if (!scanNumber) {
      return res.status(400).json({ 
        message: "Scan number is required" 
      });
    }

    if (!isHardwareBridgeConfigured()) {
      return res.status(503).json({ 
        success: false,
        message: "Hardware not connected. Please connect R307 fingerprint scanner." 
      });
    }

    console.log(`Fingerprint scan ${scanNumber} requested${patientId ? ` for patient: ${patientId}` : ' (pre-registration)'}`);

    const hardwareResponse = await callHardwareBridge('/scan-fingerprint', {
      method: 'POST',
      body: { patientId: patientId || null, scanNumber }
    });

    if (!hardwareResponse?.success) {
      return res.status(500).json({
        success: false,
        message: hardwareResponse?.message || `Scan ${scanNumber} failed. Please try again.`
      });
    }

    res.json({
      success: true,
      scanNumber,
      scanData: hardwareResponse?.scanData || null,
      message: `Scan ${scanNumber} completed successfully`
    });

  } catch (error) {
    console.error('Error scanning fingerprint:', error);
    res.status(error.status || 500).json({ 
      success: false,
      message: error.message || 'Fingerprint scan failed' 
    });
  }
};

// 3️⃣ Generate OTP for Raspberry Pi / SIM800L to send
export const generateHardwareOtp = async (req, res) => {
  try {
    const { patientId } = req.body;

    if (!patientId) {
      return res.status(400).json({ message: "Patient ID is required" });
    }

    const patient = await Patient.findById(patientId);
    
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    // Generate a 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 5 * 60 * 1000);

    // Save/Update in DB
    await Otp.findOneAndUpdate(
      { phone: patient.phone, purpose: 'hardware_auth' },
      { otp: otpCode, expiresAt: expires, attempts: 0, createdAt: new Date() },
      { upsert: true }
    );

    // Send SMS via Pi-server if hardware bridge is configured
    if (isHardwareBridgeConfigured()) {
      try {
        const smsResult = await callHardwareBridge('/send-sms', {
          method: 'POST',
          body: {
            phone: patient.phone,
            message: `Your Smart ID verification code is: ${otpCode}. Valid for 5 minutes.`
          }
        });

        if (!smsResult?.success) {
          console.warn('SMS send returned failure:', smsResult);
          // Continue anyway - OTP is valid even if SMS fails
        }
      } catch (smsError) {
        console.error('Failed to send SMS via hardware bridge:', smsError.message);
        // Continue anyway - OTP is valid even if SMS fails
      }
    }

    // Return the OTP and Phone number to the Raspberry Pi
    res.json({
      message: "OTP generated",
      phone: patient.phone,
      otp: otpCode,
      smsSent: isHardwareBridgeConfigured()
    });

  } catch (error) {
    console.error("Error generating OTP:", error);
    res.status(500).json({ message: "Failed to generate OTP" });
  }
};

// 4️⃣ Enroll Fingerprint (store template ID in Atlas)
export const enrollFingerprint = async (req, res) => {
  try {
    const { patientId } = req.body;

    if (!isHardwareBridgeConfigured()) {
      return res.status(503).json({
        success: false,
        message: "Hardware not connected. Please connect R307 fingerprint scanner."
      });
    }

    let fingerId;
    let patient = null;

    if (patientId) {
      patient = await Patient.findById(patientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      if (patient.fingerprintId) {
        return res.status(409).json({ message: "Fingerprint already enrolled for this patient" });
      }

      const hardwareResponse = await callHardwareBridge("/fingerprint/enroll", {
        method: "POST",
        body: { patientId }
      });

      fingerId = extractFingerprintId(hardwareResponse);

      if (!fingerId) {
        return res.status(500).json({
          success: false,
          message: hardwareResponse?.message || "Fingerprint scanner error. Please try again."
        });
      }

      patient.fingerprintId = fingerId;
      await patient.save();

      await logAudit({
        actor: req.user.id || req.user._id,
        actorRole: req.user.role,
        action: "ENROLL_FINGERPRINT",
        patient: patient._id,
        resource: "PATIENT_BIOMETRIC",
        ipAddress: req.ip
      });
    } else {
      const hardwareResponse = await callHardwareBridge("/fingerprint/enroll", {
        method: "POST",
        body: { patientId: null }
      });

      fingerId = extractFingerprintId(hardwareResponse);

      if (!fingerId) {
        return res.status(500).json({
          success: false,
          message: hardwareResponse?.message || "Fingerprint scanner error. Please try again."
        });
      }
    }

    res.json({
      success: true,
      message: "Fingerprint enrolled successfully",
      patientId: patient?._id || null,
      fingerId
    });

  } catch (error) {
    console.error("Error enrolling fingerprint:", error);
    res.status(error.status || 500).json({
      message: error.message || "Fingerprint enrollment failed"
    });
  }
};

// Keep original logic for direct GET requests if needed by frontend
export const getPatientByNfc = async (req, res) => {
  try {
    const { nfcId } = req.params;

    const patient = await Patient.findOne({ nfcUuid: nfcId })
      .populate('user', 'name username role');

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    res.json(patient);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "NFC lookup failed" });
  }
};

// Start Fingerprint Enrollment
export const startFingerprintEnrollment = async (req, res) => {
  try {
    if (!isHardwareBridgeConfigured()) {
      return res.status(503).json({
        success: false,
        code: 'HARDWARE_NOT_CONFIGURED',
        message: 'Hardware bridge not configured. Set HARDWARE_BRIDGE_URL and HARDWARE_BRIDGE_KEY in environment to enable fingerprint enrollment.',
        hint: 'Use ngrok to expose your Raspberry Pi server to the internet.'
      });
    }

    console.log("Starting fingerprint enrollment (single scan mode)...");

    const hardwareResponse = await callHardwareBridge("/enroll-fingerprint", {
      method: "POST",
      body: { singleScan: true }
    });

    if (hardwareResponse?.success === false) {
      const isSensorError = hardwareResponse?.message?.includes('not initialized') || hardwareResponse?.message?.includes('sensor');
      return res.status(400).json({
        success: false,
        code: isSensorError ? 'FINGERPRINT_SENSOR_NOT_INITIALIZED' : 'HARDWARE_ERROR',
        error: hardwareResponse?.message,
        message: isSensorError 
          ? 'Fingerprint sensor not initialized. Please check hardware connection to R307 sensor.'
          : hardwareResponse?.message || "Failed to start enrollment"
      });
    }

    res.json({
      success: true,
      operationId: hardwareResponse?.operationId,
      step: hardwareResponse?.step,
      message: "Enrollment started. Place finger on scanner.",
      singleScan: true
    });

  } catch (error) {
    console.error("Error starting fingerprint enrollment:", error);
    res.status(error.status || 500).json({
      success: false,
      code: error.code || 'HARDWARE_ERROR',
      message: error.message || "Failed to start enrollment"
    });
  }
};

// Get Fingerprint Enrollment Status
export const getFingerprintEnrollmentStatus = async (req, res) => {
  try {
    const { operationId } = req.query;

    if (!isHardwareBridgeConfigured()) {
      return res.status(503).json({
        success: false,
        code: 'HARDWARE_NOT_CONFIGURED',
        message: 'Hardware bridge not configured. Set HARDWARE_BRIDGE_URL and HARDWARE_BRIDGE_KEY in environment to enable fingerprint enrollment.',
        hint: 'Use ngrok to expose your Raspberry Pi server to the internet.'
      });
    }

    const url = operationId 
      ? `/enroll-fingerprint/status?operationId=${operationId}`
      : '/enroll-fingerprint/status';

    const hardwareResponse = await callHardwareBridge(url, {
      method: "GET"
    });

    res.json({
      success: hardwareResponse?.success !== false,
      step: hardwareResponse?.step,
      substep: hardwareResponse?.substep,
      completed: hardwareResponse?.completed,
      failed: hardwareResponse?.failed,
      fingerprintId: extractFingerprintId(hardwareResponse),
      enrollment: hardwareResponse?.enrollment,
      message: hardwareResponse?.message,
      timeout: hardwareResponse?.timeout,
      error: hardwareResponse?.error
    });

  } catch (error) {
    console.error("Error getting enrollment status:", error);
    res.status(error.status || 500).json({
      success: false,
      code: error.code || 'HARDWARE_ERROR',
      message: error.message || "Failed to get enrollment status"
    });
  }
};

// Complete Fingerprint Enrollment
export const completeFingerprintEnrollment = async (req, res) => {
  try {
    if (!isHardwareBridgeConfigured()) {
      return res.status(503).json({
        success: false,
        message: "Hardware not connected. Please connect R307 fingerprint scanner."
      });
    }

    const hardwareResponse = await callHardwareBridge("/enroll-fingerprint/complete", {
      method: "POST",
      body: {}
    });

    if (hardwareResponse?.success === false || hardwareResponse?.in_progress) {
      return res.status(400).json({
        success: false,
        message: hardwareResponse?.message || "Enrollment not yet complete"
      });
    }

    res.json({
      success: true,
      fingerprintId: extractFingerprintId(hardwareResponse),
      message: "Enrollment completed successfully"
    });

  } catch (error) {
    console.error("Error completing fingerprint enrollment:", error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "Failed to complete enrollment"
    });
  }
};

// Cancel Fingerprint Enrollment
export const cancelFingerprintEnrollment = async (req, res) => {
  try {
    if (!isHardwareBridgeConfigured()) {
      return res.status(503).json({
        success: false,
        message: "Hardware not connected."
      });
    }

    const hardwareResponse = await callHardwareBridge("/enroll-fingerprint/cancel", {
      method: "POST"
    });

    res.json({
      success: true,
      message: hardwareResponse?.message || "Enrollment cancelled"
    });

  } catch (error) {
    console.error("Error cancelling fingerprint enrollment:", error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "Failed to cancel enrollment"
    });
  }
};

export const deleteEnrolledFingerprint = async (req, res) => {
  try {
    const { fingerprintId } = req.params;

    if (!fingerprintId) {
      return res.status(400).json({
        success: false,
        message: "Fingerprint ID is required"
      });
    }

    if (!isHardwareBridgeConfigured()) {
      return res.status(503).json({
        success: false,
        message: "Hardware not connected. Please connect R307 fingerprint scanner."
      });
    }

    const hardwareResponse = await callHardwareBridge(`/fingerprint/delete/${fingerprintId}`, {
      method: "DELETE"
    });

    res.json({
      success: true,
      fingerprintId,
      message: hardwareResponse?.message || "Fingerprint deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting fingerprint:", error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "Failed to delete fingerprint"
    });
  }
};
