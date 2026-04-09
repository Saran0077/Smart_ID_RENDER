import Patient from '../models/Patient.js';
import User from '../models/User.js';
import { logAudit } from '../utils/auditLogger.js';
import { callHardwareBridge, isHardwareBridgeConfigured } from '../utils/hardwareGateway.js';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import mongoose from 'mongoose';

const getActorId = (req) => req.user?.id || req.user?._id || null;
const getRecordSourceLabel = (entry) => {
  if (entry?.source === 'doctor_portal') return 'Doctor';
  if (entry?.source === 'hospital_portal') return 'Hospital';
  if (entry?.recordedByRole === 'doctor') return 'Doctor';
  if (entry?.recordedByRole === 'hospital') return 'Hospital';
  if (entry?.recordedByRole === 'admin') return 'Admin';
  return 'Care team';
};

const calculateAge = (dob) => {
  if (!dob) return null;

  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDifference = today.getMonth() - birthDate.getMonth();

  if (
    monthDifference < 0 ||
    (monthDifference === 0 && today.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }

  return age;
};

const parseAllergies = (allergies) => {
  if (Array.isArray(allergies)) {
    return allergies.filter(Boolean);
  }

  if (typeof allergies !== 'string') {
    return [];
  }

  return allergies
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const parseStringList = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => `${item}`.trim()).filter(Boolean);
  }

  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const parseOptionalPositiveNumber = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

const parseRequiredPositiveNumber = (value, fieldLabel) => {
  if (value === undefined || value === null || value === '') {
    return {
      value: null,
      error: `${fieldLabel} is required`
    };
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return {
      value: null,
      error: `${fieldLabel} must be a positive number`
    };
  }

  return {
    value: parsed,
    error: null
  };
};

const buildPatientSummary = (patient) => ({
  id: patient._id,
  fullName: patient.fullName,
  govtId: patient.govtId,
  dob: patient.dob,
  nfcId: patient.nfcUuid,
  phone: patient.phone,
  age: patient.age,
  gender: patient.gender,
  bloodGroup: patient.bloodGroup,
  heightCm: patient.heightCm,
  weightKg: patient.weightKg,
  allergies: patient.allergies,
  surgeries: patient.surgeries,
  emergencyContact: patient.emergencyContact
});

const buildRegistrationConflict = (field) => {
  switch (field) {
    case 'phone':
      return {
        message: 'A patient with this phone number already exists',
        code: 'PATIENT_PHONE_CONFLICT',
        field: 'phone'
      };
    case 'nfcUuid':
      return {
        message: 'This NFC card is already linked to another patient',
        code: 'PATIENT_NFC_CONFLICT',
        field: 'nfcUuid'
      };
    case 'fingerprintId':
      return {
        message: 'This fingerprint is already enrolled to another patient',
        code: 'PATIENT_FINGERPRINT_CONFLICT',
        field: 'fingerprintId'
      };
    default:
      return {
        message: 'Duplicate value found',
        code: 'PATIENT_DUPLICATE_CONFLICT',
        field: field || 'unknown'
      };
  }
};

const mapMedicalHistoryEntryToVisit = (entry, patient) => ({
  hospital:
    entry.hospitalName ||
    (entry.source === 'doctor_portal' ? 'Doctor Portal' : 'Hospital not recorded'),
  doctor: entry.doctorName || 'Care team',
  date: entry.diagnosedDate || patient.updatedAt,
  summary: entry.notes || entry.condition || 'Medical record updated',
  category: entry.condition || 'General',
  recordedByRole: entry.recordedByRole || null,
  source: entry.source || null,
  sourceLabel: getRecordSourceLabel(entry)
});

// 🟢 CREATE PATIENT PROFILE
export const createPatientProfile = async (req, res) => {
  try {
    const actorId = getActorId(req);
    const existingPatient = await Patient.findOne({ user: req.user._id });
    if (existingPatient) {
      return res.status(400).json({
        message: 'Patient profile already exists'
      });
    }

    const heightCm = parseOptionalPositiveNumber(req.body.heightCm);
    const weightKg = parseOptionalPositiveNumber(req.body.weightKg);
    const age = req.body.age ?? calculateAge(req.body.dob);

    if (age === null || age < 0) {
      return res.status(400).json({
        message: 'A valid date of birth is required'
      });
    }

    const patient = await Patient.create({
      user: req.user._id,
      ...req.body,
      age,
      dob: new Date(req.body.dob),
      heightCm,
      weightKg,
      allergies: parseAllergies(req.body.allergies),
      surgeries: parseStringList(req.body.surgeries)
    });

    res.status(201).json({
      message: 'Patient profile created successfully',
      patient
    });

    await logAudit({
      actor: actorId,
      actorRole: req.user.role,
      action: 'PATIENT_REGISTER',
      patient: patient._id,
      resource: 'PATIENT_PROFILE',
      ipAddress: req.ip,
      targetType: 'patient',
      targetId: `${patient._id}`,
      targetName: patient.fullName
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'Server error while creating patient profile'
    });
  }
};

// 🔵 GET OWN PATIENT PROFILE
export const getMyPatientProfile = async (req, res) => {
  try {
    const actorId = getActorId(req);
    const patient = await Patient.findOne({ user: req.user._id }).populate(
      'user',
      'name username role'
    );

      if (!patient) {
        return res.status(404).json({
          message: 'Patient profile not found'
        });
      }

      await logAudit({
        actor: actorId,
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
};

// 🟡 UPDATE OWN PATIENT PROFILE
export const updateMyPatientProfile = async (req, res) => {
  try {
    const actorId = getActorId(req);
    const age = req.body.dob ? calculateAge(req.body.dob) : undefined;
    const updates = {
      ...req.body,
      heightCm: parseOptionalPositiveNumber(req.body.heightCm),
      weightKg: parseOptionalPositiveNumber(req.body.weightKg),
      allergies: req.body.allergies === undefined ? undefined : parseAllergies(req.body.allergies),
      surgeries: req.body.surgeries === undefined ? undefined : parseStringList(req.body.surgeries)
    };

    if (age !== undefined) {
      if (age === null || age < 0) {
        return res.status(400).json({
          message: 'A valid date of birth is required'
        });
      }

      updates.age = age;
    }

    Object.keys(updates).forEach((key) => updates[key] === undefined && delete updates[key]);

    const patient = await Patient.findOneAndUpdate(
      { user: req.user._id },
      updates,
      { returnDocument: 'after', runValidators: true }
    );

    if (!patient) {
      return res.status(404).json({
        message: 'Patient profile not found'
      });
    }

    await logAudit({
      actor: actorId,
      actorRole: req.user.role,
      action: 'PATIENT_PROFILE_UPDATE',
      patient: patient._id,
      resource: 'PATIENT_PROFILE',
      ipAddress: req.ip,
      targetType: 'patient',
      targetId: `${patient._id}`,
      targetName: patient.fullName
    });

    res.json({
      message: 'Patient profile updated successfully',
      patient
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'Server error while updating patient profile'
    });
  }
};

export const registerPatientByHospital = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const actorId = getActorId(req);
    const {
      fullName,
      dob,
      gender,
      phone,
      
      bloodGroup,
      emergencyName,
      emergencyPhone,
      allergies,
      surgeries,
      heightCm,
      weightKg,
      nfcId,
      govtId,
      address,
      fingerprintId
    } = req.body;

    if (!fullName || !dob || !gender || !phone || !bloodGroup || !nfcId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: 'Full name, DOB, gender, phone, blood group, and NFC ID are required'
      });
    }

    const age = calculateAge(dob);
    if (age === null || age < 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: 'A valid date of birth is required'
      });
    }

    const parsedHeightCm = parseRequiredPositiveNumber(heightCm, 'Height (cm)');
    if (parsedHeightCm.error) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: parsedHeightCm.error });
    }

    const parsedWeightKg = parseRequiredPositiveNumber(weightKg, 'Weight (kg)');
    if (parsedWeightKg.error) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: parsedWeightKg.error });
    }

    const existingPhonePatient = await Patient.findOne({ phone }).session(session);
    if (existingPhonePatient) {
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json(buildRegistrationConflict('phone'));
    }

    const existingNfcPatient = await Patient.findOne({ nfcUuid: nfcId }).session(session);
    if (existingNfcPatient) {
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json(buildRegistrationConflict('nfcUuid'));
    }

    if (fingerprintId && !`${fingerprintId}`.startsWith('SKIPPED-')) {
      const existingFingerprintPatient = await Patient.findOne({ fingerprintId }).session(session);
      if (existingFingerprintPatient) {
        await session.abortTransaction();
        session.endSession();
        return res.status(409).json(buildRegistrationConflict('fingerprintId'));
      }
    }

    const usernameBase = `patient_${phone.replace(/\D/g, '').slice(-10) || Date.now()}`;
    let username = usernameBase;
    let suffix = 1;

    while (await User.findOne({ username }).session(session)) {
      username = `${usernameBase}_${suffix}`;
      suffix += 1;
    }

    const tempPassword = crypto.randomBytes(4).toString('hex');
    const tempPasswordExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await User.create([{
      name: fullName,
      username,
      password: tempPassword,
      tempPassword: tempPassword,
      tempPasswordExpires: tempPasswordExpires,
      role: 'patient'
    }], { session });

    const patient = await Patient.create([{
      user: user[0]._id,
      nfcUuid: nfcId,
      fingerprintId: fingerprintId || null,
      fullName,
      govtId: govtId || null,
      dob: new Date(dob),
      age,
      gender,
      bloodGroup,
      heightCm: parsedHeightCm.value,
      weightKg: parsedWeightKg.value,
      phone,
      address: address || '',
      emergencyContact: {
        name: emergencyName || '',
        phone: emergencyPhone || ''
      },
      allergies: parseAllergies(allergies),
      surgeries: parseStringList(surgeries)
    }], { session });

    await session.commitTransaction();
    session.endSession();

    await logAudit({
      actor: actorId,
      actorRole: req.user.role,
      action: 'PATIENT_REGISTER',
      patient: patient[0]._id,
      resource: 'PATIENT_PROFILE',
      ipAddress: req.ip,
      targetType: 'patient',
      targetId: `${patient[0]._id}`,
      targetName: patient[0].fullName,
      metadata: {
        nfcId: patient[0].nfcUuid,
        fingerprintId: patient[0].fingerprintId
      }
    });

    // Send temporary password via SMS if hardware bridge is configured
    if (isHardwareBridgeConfigured() && patient[0].phone) {
      try {
        await callHardwareBridge('/send-sms', {
          body: {
            phone: patient[0].phone,
            message: `Smart-ID: Your temporary password is ${tempPassword}. Use it to log in. Valid for 24 hours.`
          }
        });
      } catch (smsError) {
        console.warn('Failed to send temp password SMS:', smsError.message);
      }
    }

    res.status(201).json({
      message: 'Patient registered successfully',
      patientId: patient[0]._id,
      fullName: patient[0].fullName,
      nfcId: patient[0].nfcUuid,
      fingerprintId: patient[0].fingerprintId,
      age: patient[0].age,
      username: user[0].username,
      temporaryPasswordHint: isHardwareBridgeConfigured()
        ? 'Sent via SMS to your registered phone'
        : 'Contact hospital admin for temporary password'
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Patient registration error:', error);
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0] || 'unknown';
      return res.status(409).json({ 
        ...buildRegistrationConflict(duplicateField)
      });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Server error while registering patient' });
  }
};

export const getMyPatientEMR = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const patient = await Patient.findOne({ user: userId }).populate('user', 'name username role');

    if (!patient) {
      return res.status(404).json({ message: 'Patient profile not found' });
    }

    await logAudit({
      actor: userId,
      actorRole: req.user.role,
      action: 'PATIENT_EMR_VIEW',
      patient: patient._id,
      resource: 'PATIENT_EMR',
      ipAddress: req.ip,
      targetType: 'patient',
      targetId: `${patient._id}`,
      targetName: patient.fullName
    });

    const visits = (patient.medicalHistory || [])
      .map((entry) => mapMedicalHistoryEntryToVisit(entry, patient))
      .sort((left, right) => new Date(right.date || 0) - new Date(left.date || 0));

    res.json({
      patient: buildPatientSummary(patient),
      visits
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while fetching EMR' });
  }
};

export const getMyPatientRecords = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const patient = await Patient.findOne({ user: userId }).populate('user', 'name username role');

    if (!patient) {
      return res.status(404).json({ message: 'Patient profile not found' });
    }

    await logAudit({
      actor: userId,
      actorRole: req.user.role,
      action: 'PATIENT_RECORDS_VIEW',
      patient: patient._id,
      resource: 'PATIENT_RECORDS',
      ipAddress: req.ip,
      targetType: 'patient',
      targetId: `${patient._id}`,
      targetName: patient.fullName
    });

    res.json({
      patient: buildPatientSummary(patient),
      records: patient.medicalHistory || []
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while fetching patient records' });
  }
};

export const getMyPatientPrescriptions = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const patient = await Patient.findOne({ user: userId });

    if (!patient) {
      return res.status(404).json({ message: 'Patient profile not found' });
    }

    await logAudit({
      actor: userId,
      actorRole: req.user.role,
      action: 'PATIENT_PRESCRIPTIONS_VIEW',
      patient: patient._id,
      resource: 'PATIENT_PRESCRIPTIONS',
      ipAddress: req.ip,
      targetType: 'patient',
      targetId: `${patient._id}`,
      targetName: patient.fullName
    });

    const prescriptions = [...(patient.medicalHistory || [])]
      .sort((left, right) => new Date(right.diagnosedDate || 0) - new Date(left.diagnosedDate || 0))
      .slice(0, 5)
      .map((entry, index) => ({
      id: `${patient._id}-${index + 1}`,
      name: entry.condition || `Prescription ${index + 1}`,
      notes: entry.notes || 'No additional notes',
      issuedAt: entry.diagnosedDate || patient.updatedAt,
      doctor: entry.doctorName || 'Care team',
      hospital: entry.hospitalName || (entry.source === 'doctor_portal' ? 'Doctor Portal' : 'Hospital not recorded'),
      source: entry.source || null,
      sourceLabel: getRecordSourceLabel(entry),
      recordedByRole: entry.recordedByRole || null
    }));

    res.json({ prescriptions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while fetching prescriptions' });
  }
};

export const addClinicalNote = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const user = req.user;
    const patientId = req.params.patientId || req.body.patientId;

    if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({ message: 'A valid patient ID is required' });
    }

    const patient = await Patient.findById(patientId);

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const noteSource = req.body.source || (req.user.role === 'doctor' ? 'doctor_portal' : 'hospital_portal');
    const hospitalOrFacilityName =
      req.body.hospitalName ||
      req.body.facilityName ||
      req.user?.facilityName ||
      req.user?.hospitalName ||
      null;
    const note = {
      condition: req.body.mode === 'EMERGENCY' ? 'Emergency intervention' : (req.body.condition || 'Clinical note'),
      diagnosedDate: req.body.timestamp || new Date(),
      notes: req.body.content,
      doctorName: user?.name || 'Unknown',
      doctorId: userId,
      hospitalName: hospitalOrFacilityName,
      recordedByRole: req.user.role,
      source: noteSource
    };

    // Use atomic $push operator to prevent race conditions when multiple doctors add notes simultaneously
    await Patient.findByIdAndUpdate(patientId, {
      $push: { medicalHistory: note }
    });

    await logAudit({
      actor: userId,
      actorRole: req.user.role,
      action: req.body.mode === 'EMERGENCY'
        ? 'EMERGENCY_ACCESS'
        : req.user.role === 'doctor'
          ? 'DOCTOR_NOTE_ADD'
          : 'CLINICAL_NOTE_ADD',
      patient: patient._id,
      resource: 'EMR_NOTE',
      ipAddress: req.ip,
      targetType: 'patient',
      targetId: `${patient._id}`,
      targetName: patient.fullName,
      metadata: {
        mode: req.body.mode || 'STANDARD',
        hospitalName: note.hospitalName || null,
        source: note.source,
        condition: note.condition
      }
    });

    // Fetch updated patient for response
    const updatedPatient = await Patient.findById(patientId);

    res.status(201).json({
      message: 'Clinical note saved',
      patient: buildPatientSummary(updatedPatient),
      note
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while saving clinical note' });
  }
};

export const exportPatientPDF = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const patient = await Patient.findOne({ user: userId }).populate('user', 'name username email role');

    if (!patient) {
      return res.status(404).json({ message: 'Patient profile not found' });
    }

    await logAudit({
      actor: userId,
      actorRole: req.user.role,
      action: 'PATIENT_PDF_EXPORT',
      patient: patient._id,
      resource: 'PATIENT_PROFILE_PDF',
      ipAddress: req.ip,
      targetType: 'patient',
      targetId: `${patient._id}`,
      targetName: patient.fullName
    });

    const pdfBuffer = await buildPatientPDF(patient);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="smart-id-profile-${patient._id}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to export patient PDF' });
  }
};

export const exportMedicalHistoryPDF = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const patient = await Patient.findOne({ user: userId }).populate('user', 'name username email role');

    if (!patient) {
      return res.status(404).json({ message: 'Patient profile not found' });
    }

    await logAudit({
      actor: userId,
      actorRole: req.user.role,
      action: 'PATIENT_PDF_EXPORT',
      patient: patient._id,
      resource: 'PATIENT_MEDICAL_HISTORY_PDF',
      ipAddress: req.ip,
      targetType: 'patient',
      targetId: `${patient._id}`,
      targetName: patient.fullName
    });

    const pdfBuffer = await buildMedicalHistoryPDF(patient);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="smart-id-medical-history-${patient._id}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to export medical history PDF' });
  }
};

const buildPatientPDF = (patient) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).text('Smart-ID Patient Profile', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'right' });
      doc.moveDown(2);

      doc.fontSize(12).text('Personal Information', { underline: true });
      doc.fontSize(11);
      doc.text(`Full Name: ${patient.fullName || 'N/A'}`);
      doc.text(`Health ID: ${patient.user?.username || 'N/A'}`);
      doc.text(`Date of Birth: ${patient.dob ? new Date(patient.dob).toLocaleDateString() : 'N/A'}`);
      doc.text(`Age: ${patient.age || 'N/A'} years`);
      doc.text(`Gender: ${patient.gender || 'N/A'}`);
      doc.text(`Blood Group: ${patient.bloodGroup || 'N/A'}`);
      doc.moveDown();

      doc.fontSize(12).text('Contact Information', { underline: true });
      doc.fontSize(11);
      doc.text(`Phone: ${patient.phone || 'N/A'}`);
      doc.text(`Email: ${patient.user?.email || 'N/A'}`);
      doc.text(`Address: ${patient.address || 'N/A'}`);
      doc.moveDown();

      doc.fontSize(12).text('Emergency Contact', { underline: true });
      doc.fontSize(11);
      doc.text(`Name: ${patient.emergencyContact?.name || 'N/A'}`);
      doc.text(`Phone: ${patient.emergencyContact?.phone || 'N/A'}`);
      doc.moveDown();

      doc.fontSize(12).text('Medical Information', { underline: true });
      doc.fontSize(11);
      doc.text(`Allergies: ${patient.allergies?.join(', ') || 'None'}`);
      doc.text(`Surgeries: ${patient.surgeries?.join(', ') || 'None'}`);
      doc.text(`Height: ${patient.heightCm ? patient.heightCm + ' cm' : 'N/A'}`);
      doc.text(`Weight: ${patient.weightKg ? patient.weightKg + ' kg' : 'N/A'}`);
      doc.moveDown(2);

      doc.fontSize(9).text('This document was generated by Smart-ID Healthcare Platform.', { align: 'center' });
      doc.text('For any queries, contact support@smart-id.health', { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

const buildMedicalHistoryPDF = async (patient) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).text('Smart-ID Medical History', { align: 'center' });
      doc.moveDown();

      doc.fontSize(12).text(`Patient: ${patient.fullName || 'N/A'}`);
      doc.text(`Health ID: ${patient.user?.username || 'N/A'}`);
      doc.text(`Generated: ${new Date().toLocaleString()}`);
      doc.moveDown(2);

      const medicalHistory = patient.medicalHistory || [];
      doc.fontSize(14).text(`Medical Records (${medicalHistory.length})`, { underline: true });
      doc.moveDown();

      if (medicalHistory.length === 0) {
        doc.fontSize(11).text('No medical history records found.');
      } else {
        medicalHistory.forEach((record, index) => {
          if (doc.y > 700) {
            doc.addPage();
          }
          doc.fontSize(11).text(`${index + 1}. ${record.condition || 'Clinical Note'}`);
          doc.fontSize(10).text(`   Date: ${record.diagnosedDate ? new Date(record.diagnosedDate).toLocaleDateString() : 'N/A'}`);
          doc.fontSize(10).text(`   Source: ${getRecordSourceLabel(record)}`);
          doc.fontSize(10).text(`   Hospital: ${record.hospitalName || (record.source === 'doctor_portal' ? 'Doctor Portal' : 'Hospital not recorded')}`);
          doc.fontSize(10).text(`   Recorded By: ${record.doctorName || 'Care team'}`);
          doc.fontSize(10).text(`   Notes: ${record.notes || 'No additional notes'}`);
          doc.moveDown(0.5);
        });
      }

      doc.moveDown(2);
      doc.fontSize(9).text('This document was generated by Smart-ID Healthcare Platform.', { align: 'center' });
      doc.text('For any queries, contact support@smart-id.health', { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};
