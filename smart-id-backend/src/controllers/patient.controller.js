import Patient from '../models/Patient.js';
import User from '../models/User.js';
import { logAudit } from '../utils/auditLogger.js';
import { callHardwareBridge, isHardwareBridgeConfigured } from '../utils/hardwareGateway.js';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import mongoose from 'mongoose';

const getActorId = (req) => req.user?.id || req.user?._id || null;
const getRecordSourceLabel = (entry) => {
  if (entry?.recordedByRole === 'doctor') return 'Doctor';
  if (entry?.recordedByRole === 'hospital') return 'Hospital';
  if (entry?.recordedByRole === 'admin') return 'Admin';
  if (entry?.source === 'doctor_portal') return 'Doctor';
  if (entry?.source === 'hospital_portal') return 'Hospital';
  return 'Care team';
};

const getHospitalDisplayName = (entry) => {
  if (entry?.hospitalName) return entry.hospitalName;
  if (entry?.recordedByRole === 'doctor') return 'Doctor Portal';
  if (entry?.source === 'doctor_portal') return 'Doctor Portal';
  return 'Hospital not recorded';
};

const getAuthorDisplayName = (entry) => {
  if (entry?.recordedByRole === 'doctor') {
    return entry?.doctorName || 'Doctor not recorded';
  }

  if (entry?.recordedByRole === 'hospital') {
    return entry?.doctorName || 'Hospital team';
  }

  return entry?.doctorName || 'Care team';
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

const normalizeText = (value) => {
  if (value === undefined || value === null) {
    return '';
  }

  return `${value}`.trim();
};

const normalizePhoneNumber = (value) => {
  const normalized = normalizeText(value).replace(/[^\d+]/g, '');
  return normalized;
};

const normalizeGovtId = (value) => {
  const normalized = normalizeText(value);
  return normalized ? normalized.toUpperCase() : '';
};

const isValidPhoneNumber = (value) => /^\+?\d{10,15}$/.test(value);

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

const normalizeFingerprintId = (fingerprintId) => {
  if (fingerprintId === undefined || fingerprintId === null || fingerprintId === '') {
    return null;
  }

  return `${fingerprintId}`;
};

const isRealFingerprintId = (fingerprintId) => Boolean(normalizeFingerprintId(fingerprintId));

const validateHospitalRegistrationInput = (payload, { requireFingerprint = false } = {}) => {
  const normalized = {
    fullName: normalizeText(payload.fullName),
    dob: payload.dob,
    gender: normalizeText(payload.gender).toLowerCase(),
    phone: normalizePhoneNumber(payload.phone),
    bloodGroup: normalizeText(payload.bloodGroup),
    emergencyName: normalizeText(payload.emergencyName),
    emergencyPhone: normalizePhoneNumber(payload.emergencyPhone),
    allergies: payload.allergies,
    surgeries: payload.surgeries,
    heightCm: payload.heightCm,
    weightKg: payload.weightKg,
    nfcId: normalizeText(payload.nfcId),
    govtId: normalizeGovtId(payload.govtId),
    address: normalizeText(payload.address),
    fingerprintId: normalizeFingerprintId(payload.fingerprintId)
  };

  const requiredFields = [
    ['fullName', normalized.fullName, 'Full name is required'],
    ['dob', normalized.dob, 'Date of birth is required'],
    ['gender', normalized.gender, 'Gender is required'],
    ['govtId', normalized.govtId, 'Government ID is required'],
    ['phone', normalized.phone, 'Phone number is required'],
    ['address', normalized.address, 'Address is required'],
    ['emergencyName', normalized.emergencyName, 'Emergency contact name is required'],
    ['emergencyPhone', normalized.emergencyPhone, 'Emergency contact phone is required'],
    ['bloodGroup', normalized.bloodGroup, 'Blood group is required'],
    ['nfcId', normalized.nfcId, 'NFC ID is required']
  ];

  for (const [field, value, message] of requiredFields) {
    if (!value) {
      return { normalized, error: { field, message } };
    }
  }

  if (!['male', 'female', 'other'].includes(normalized.gender)) {
    return {
      normalized,
      error: {
        field: 'gender',
        message: 'Gender must be one of male, female, or other'
      }
    };
  }

  if (!isValidPhoneNumber(normalized.phone)) {
    return {
      normalized,
      error: {
        field: 'phone',
        message: 'Phone number must contain 10 to 15 digits'
      }
    };
  }

  if (!isValidPhoneNumber(normalized.emergencyPhone)) {
    return {
      normalized,
      error: {
        field: 'emergencyPhone',
        message: 'Emergency contact phone must contain 10 to 15 digits'
      }
    };
  }

  if (requireFingerprint && !isRealFingerprintId(normalized.fingerprintId)) {
    return {
      normalized,
      error: {
        field: 'fingerprintId',
        message: 'Fingerprint enrollment must be completed before registration'
      }
    };
  }

  return {
    normalized,
    error: null
  };
};

let transactionSupportCache = null;

const environmentSupportsTransactions = async () => {
  if (transactionSupportCache !== null) {
    return transactionSupportCache;
  }

  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    transactionSupportCache = Boolean(hello?.setName || hello?.msg === 'isdbgrid');
  } catch (error) {
    console.warn('Unable to determine transaction support, falling back to non-transactional registration:', error.message);
    transactionSupportCache = false;
  }

  return transactionSupportCache;
};

const shouldCleanupFingerprint = (fingerprintId) => isRealFingerprintId(fingerprintId);

const cleanupFingerprintEnrollment = async (fingerprintId) => {
  if (!shouldCleanupFingerprint(fingerprintId)) {
    return {
      fingerprintCleanupAttempted: false,
      fingerprintCleanupSucceeded: false,
      fingerprintCleanupReason: 'not-required'
    };
  }

  if (!isHardwareBridgeConfigured()) {
    return {
      fingerprintCleanupAttempted: false,
      fingerprintCleanupSucceeded: false,
      fingerprintCleanupReason: 'hardware-not-configured'
    };
  }

  const existingPatient = await Patient.findOne({ fingerprintId: normalizeFingerprintId(fingerprintId) });
  if (existingPatient) {
    return {
      fingerprintCleanupAttempted: false,
      fingerprintCleanupSucceeded: false,
      fingerprintCleanupReason: 'linked-to-existing-patient'
    };
  }

  try {
    await callHardwareBridge(`/fingerprint/delete/${fingerprintId}`, {
      method: 'DELETE'
    });

    return {
      fingerprintCleanupAttempted: true,
      fingerprintCleanupSucceeded: true,
      fingerprintCleanupReason: 'deleted'
    };
  } catch (error) {
    console.error('Fingerprint cleanup failed:', {
      fingerprintId,
      message: error.message,
      status: error.status
    });
    return {
      fingerprintCleanupAttempted: true,
      fingerprintCleanupSucceeded: false,
      fingerprintCleanupReason: error.message || 'cleanup-failed'
    };
  }
};

const buildPatientSummary = (patient) => ({
  id: patient._id,
  fullName: patient.fullName,
  govtId: patient.govtId,
  dob: patient.dob,
  nfcId: patient.nfcUuid,
  fingerprintId: patient.fingerprintId,
  phone: patient.phone,
  address: patient.address,
  age: patient.age,
  gender: patient.gender,
  bloodGroup: patient.bloodGroup,
  heightCm: patient.heightCm,
  weightKg: patient.weightKg,
  allergies: patient.allergies,
  surgeries: patient.surgeries,
  emergencyContact: patient.emergencyContact
});

const normalizeComparableText = (value) => normalizeText(value).toLowerCase();

const normalizeComparableDate = (value) => {
  if (!value) {
    return '';
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  return parsedDate.toISOString().slice(0, 10);
};

const patientMatchesRegistrationPayload = (patient, normalized) => {
  if (!patient || !normalized) {
    return false;
  }

  return (
    normalizeComparableText(patient.fullName) === normalizeComparableText(normalized.fullName) &&
    normalizeComparableDate(patient.dob) === normalizeComparableDate(normalized.dob) &&
    normalizeText(patient.phone) === normalizeText(normalized.phone) &&
    normalizeText(patient.nfcUuid) === normalizeText(normalized.nfcId) &&
    normalizeGovtId(patient.govtId) === normalizeGovtId(normalized.govtId) &&
    normalizeComparableText(patient.gender) === normalizeComparableText(normalized.gender)
  );
};

const findMatchingRegisteredPatient = async (normalized, { session = null, useTransactions = false } = {}) => {
  const lookupClauses = [
    normalized.phone ? { phone: normalized.phone } : null,
    normalized.govtId ? { govtId: normalized.govtId } : null,
    normalized.nfcId ? { nfcUuid: normalized.nfcId } : null
  ].filter(Boolean);

  if (lookupClauses.length === 0) {
    return null;
  }

  let query = Patient.findOne({ $or: lookupClauses }).populate('user', 'username');
  if (useTransactions && session) {
    query = query.session(session);
  }

  const existingPatient = await query;
  return patientMatchesRegistrationPayload(existingPatient, normalized) ? existingPatient : null;
};

const buildHospitalRegistrationResponse = (patient, user, { alreadyRegistered = false } = {}) => ({
  message: alreadyRegistered
    ? 'Patient already registered. Reusing the existing record.'
    : 'Patient registered successfully',
  patientId: patient._id,
  fullName: patient.fullName,
  nfcId: patient.nfcUuid,
  fingerprintId: patient.fingerprintId,
  age: patient.age,
  username: user?.username || patient.user?.username || null,
  patient: buildPatientSummary(patient),
  alreadyRegistered,
  temporaryPasswordHint: alreadyRegistered
    ? 'Existing patient account reused'
    : isHardwareBridgeConfigured()
      ? 'Sent via SMS to your registered phone'
      : 'Contact hospital admin for temporary password'
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
    case 'govtId':
      return {
        message: 'A patient with this government ID already exists',
        code: 'PATIENT_GOVT_ID_CONFLICT',
        field: 'govtId'
      };
    case 'fingerprintId':
      return {
        message: 'This fingerprint is already enrolled to another patient',
        code: 'PATIENT_FINGERPRINT_CONFLICT',
        field: 'fingerprintId'
      };
    case 'user':
      return {
        message: 'A patient account for this registration already exists',
        code: 'PATIENT_ACCOUNT_CONFLICT',
        field: 'user'
      };
    default:
      return {
        message: 'Duplicate value found. Please verify phone number, government ID, NFC card, and fingerprint.',
        code: 'PATIENT_DUPLICATE_CONFLICT',
        field: field || 'unknown'
      };
  }
};

const inferDuplicateField = (error) => {
  const normalizeFieldFromIndexName = (indexName = '') => {
    if (!indexName) return null;

    const plainIndex = `${indexName}`
      .replace(/^[^.]*\./, '')
      .replace(/\$+/g, '')
      .replace(/_(?:-?\d+)(?:_|$).*/, '')
      .trim();

    if (!plainIndex) return null;
    if (plainIndex.includes('fingerprint')) return 'fingerprintId';
    if (plainIndex.includes('nfc')) return 'nfcUuid';
    if (plainIndex.includes('govt')) return 'govtId';
    if (plainIndex.includes('phone')) return 'phone';
    if (plainIndex.includes('username')) return 'username';
    if (plainIndex.includes('user')) return 'user';
    return plainIndex;
  };

  const candidates = [
    error,
    error?.errorResponse,
    error?.cause,
    error?.originalError,
    error?.writeErrors?.[0],
    error?.writeErrors?.[0]?.err,
    error?.result?.writeErrors?.[0],
    error?.result?.writeErrors?.[0]?.err
  ];

  for (const candidate of candidates) {
    const keyPatternField = Object.keys(candidate?.keyPattern || {})[0];
    if (keyPatternField) return keyPatternField;

    const keyValueField = Object.keys(candidate?.keyValue || {})[0];
    if (keyValueField) return keyValueField;
  }

  const duplicateMessage = candidates
    .map((candidate) => candidate?.message || candidate?.errmsg)
    .filter(Boolean)
    .join(' | ');

  const indexMatch = duplicateMessage.match(/index:\s*([^\s]+)\s*dup key/i);
  const indexField = normalizeFieldFromIndexName(indexMatch?.[1]);
  if (indexField) {
    return indexField;
  }

  if (duplicateMessage.includes('govtId')) return 'govtId';
  if (duplicateMessage.includes('phone')) return 'phone';
  if (duplicateMessage.includes('nfcUuid')) return 'nfcUuid';
  if (duplicateMessage.includes('fingerprintId')) return 'fingerprintId';
  if (duplicateMessage.includes('username')) return 'username';
  if (duplicateMessage.includes(' user_1 ')) return 'user';

  return 'unknown';
};

const extractDuplicateValue = (error, field) => {
  if (!field || field === 'unknown') {
    return null;
  }

  const candidates = [
    error,
    error?.errorResponse,
    error?.cause,
    error?.originalError,
    error?.writeErrors?.[0],
    error?.writeErrors?.[0]?.err,
    error?.result?.writeErrors?.[0],
    error?.result?.writeErrors?.[0]?.err
  ];

  for (const candidate of candidates) {
    if (candidate?.keyValue && Object.prototype.hasOwnProperty.call(candidate.keyValue, field)) {
      return candidate.keyValue[field];
    }
  }

  return null;
};

const resolveDuplicateFieldByLookup = async ({ phone, govtId, nfcId, fingerprintId, createdUserId, useTransactions, session }) => {
  const readWithSession = (query) => (useTransactions && session ? query.session(session) : query);

  if (fingerprintId) {
    const existingFingerprintPatient = await readWithSession(Patient.findOne({ fingerprintId }));
    if (existingFingerprintPatient) return 'fingerprintId';
  }

  if (nfcId) {
    const existingNfcPatient = await readWithSession(Patient.findOne({ nfcUuid: nfcId }));
    if (existingNfcPatient) return 'nfcUuid';
  }

  if (govtId) {
    const existingGovtIdPatient = await readWithSession(Patient.findOne({ govtId }));
    if (existingGovtIdPatient) return 'govtId';
  }

  if (phone) {
    const existingPhonePatient = await readWithSession(Patient.findOne({ phone }));
    if (existingPhonePatient) return 'phone';
  }

  if (createdUserId) {
    const existingUserPatient = await readWithSession(Patient.findOne({ user: createdUserId }));
    if (existingUserPatient) return 'user';
  }

  return 'unknown';
};

const isDuplicateKeyError = (error) => {
  const numericCodes = [
    error?.code,
    error?.errorResponse?.code,
    error?.cause?.code,
    error?.originalError?.code,
    error?.writeErrors?.[0]?.code,
    error?.writeErrors?.[0]?.err?.code
  ];

  if (numericCodes.some((code) => Number(code) === 11000)) {
    return true;
  }

  const mergedMessage = [
    error?.message,
    error?.errmsg,
    error?.errorResponse?.errmsg,
    error?.writeErrors?.[0]?.errmsg,
    error?.writeErrors?.[0]?.err?.errmsg
  ]
    .filter(Boolean)
    .join(' | ')
    .toLowerCase();

  return mergedMessage.includes('e11000 duplicate key');
};

const mapMedicalHistoryEntryToVisit = (entry, patient) => ({
  hospital: getHospitalDisplayName(entry),
  doctor: getAuthorDisplayName(entry),
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
  let session = null;
  let useTransactions = false;
  let createdUserId = null;
  let createdPatientId = null;
  try {
    const actorId = getActorId(req);
    const {
      normalized,
      error: validationError
    } = validateHospitalRegistrationInput(req.body, { requireFingerprint: true });
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
      fingerprintId: normalizedFingerprintId
    } = normalized;

    useTransactions = await environmentSupportsTransactions();

    if (useTransactions) {
      session = await mongoose.startSession();
      session.startTransaction();
    } else {
      console.warn('MongoDB transactions are not supported in this environment. Registration will use compensating cleanup instead.');
    }

    const failRegistration = async (status, payload, logContext = {}) => {
      if (session) {
        await session.abortTransaction();
        session.endSession();
        session = null;
      }

      const cleanupDetails = await cleanupFingerprintEnrollment(normalizedFingerprintId);

      console.error('Patient registration failed:', {
        status,
        ...logContext,
        fingerprintId: normalizedFingerprintId,
        ...cleanupDetails
      });

      return res.status(status).json({
        ...payload,
        ...cleanupDetails
      });
    };

    if (validationError) {
      return failRegistration(400, {
        message: validationError.message,
        field: validationError.field
      }, {
        reason: 'invalid-registration-payload'
      });
    }

    const age = calculateAge(dob);
    if (age === null || age < 0) {
      return failRegistration(400, {
        message: 'A valid date of birth is required'
      }, {
        reason: 'invalid-dob'
      });
    }

    const parsedHeightCm = parseRequiredPositiveNumber(heightCm, 'Height (cm)');
    if (parsedHeightCm.error) {
      return failRegistration(400, { message: parsedHeightCm.error }, {
        reason: 'invalid-height'
      });
    }

    const parsedWeightKg = parseRequiredPositiveNumber(weightKg, 'Weight (kg)');
    if (parsedWeightKg.error) {
      return failRegistration(400, { message: parsedWeightKg.error }, {
        reason: 'invalid-weight'
      });
    }

    const matchingPatient = await findMatchingRegisteredPatient(normalized, {
      session,
      useTransactions
    });
    if (matchingPatient) {
      if (session) {
        await session.abortTransaction();
        session.endSession();
        session = null;
      }

      return res.status(200).json(
        buildHospitalRegistrationResponse(matchingPatient, matchingPatient.user, {
          alreadyRegistered: true
        })
      );
    }

    const existingPhonePatient = useTransactions
      ? await Patient.findOne({ phone }).session(session)
      : await Patient.findOne({ phone });
    if (existingPhonePatient) {
      return failRegistration(409, buildRegistrationConflict('phone'), {
        reason: 'phone-conflict'
      });
    }

    const existingNfcPatient = useTransactions
      ? await Patient.findOne({ nfcUuid: nfcId }).session(session)
      : await Patient.findOne({ nfcUuid: nfcId });
    if (existingNfcPatient) {
      return failRegistration(409, buildRegistrationConflict('nfcUuid'), {
        reason: 'nfc-conflict'
      });
    }

    const existingGovtIdPatient = useTransactions
      ? await Patient.findOne({ govtId }).session(session)
      : await Patient.findOne({ govtId });
    if (existingGovtIdPatient) {
      return failRegistration(409, buildRegistrationConflict('govtId'), {
        reason: 'govt-id-conflict'
      });
    }

    if (shouldCleanupFingerprint(normalizedFingerprintId)) {
      const existingFingerprintPatient = useTransactions
        ? await Patient.findOne({ fingerprintId: normalizedFingerprintId }).session(session)
        : await Patient.findOne({ fingerprintId: normalizedFingerprintId });
      if (existingFingerprintPatient) {
        return failRegistration(409, buildRegistrationConflict('fingerprintId'), {
          reason: 'fingerprint-conflict'
        });
      }
    }

    const usernameBase = `patient_${phone.replace(/\D/g, '').slice(-10) || Date.now()}`;
    let username = usernameBase;
    let suffix = 1;

    while (
      useTransactions
        ? await User.findOne({ username }).session(session)
        : await User.findOne({ username })
    ) {
      username = `${usernameBase}_${suffix}`;
      suffix += 1;
    }

    const tempPassword = crypto.randomBytes(4).toString('hex');
    const tempPasswordExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const userPayload = {
      name: fullName,
      username,
      password: tempPassword,
      tempPassword: tempPassword,
      tempPasswordExpires: tempPasswordExpires,
      role: 'patient'
    };

    const patientPayload = (userId) => ({
      user: userId,
      nfcUuid: nfcId,
      fingerprintId: normalizedFingerprintId || null,
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
    });

    let user;
    let patient;

    if (useTransactions) {
      const createdUsers = await User.create([userPayload], { session });
      user = createdUsers[0];
      createdUserId = user._id;

      const createdPatients = await Patient.create([patientPayload(user._id)], { session });
      patient = createdPatients[0];
      createdPatientId = patient._id;

      await session.commitTransaction();
      session.endSession();
      session = null;
    } else {
      user = await User.create(userPayload);
      createdUserId = user._id;

      patient = await Patient.create(patientPayload(user._id));
      createdPatientId = patient._id;
    }

    console.log('Patient registration succeeded:', {
      patientId: patient._id,
      userId: user._id,
      fingerprintId: normalizedFingerprintId,
      usedTransactions: useTransactions
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
      targetName: patient.fullName,
      metadata: {
        nfcId: patient.nfcUuid,
        fingerprintId: patient.fingerprintId,
        usedTransactions: useTransactions
      }
    });

    if (isHardwareBridgeConfigured() && patient.phone) {
      try {
        await callHardwareBridge('/send-sms', {
          body: {
            phone: patient.phone,
            message: `Smart-ID: Your temporary password is ${tempPassword}. Use it to log in. Valid for 24 hours.`
          }
        });
      } catch (smsError) {
        console.warn('Failed to send temp password SMS:', smsError.message);
      }
    }

    res.status(201).json(buildHospitalRegistrationResponse(patient, user));
  } catch (error) {
    if (session) {
      await session.abortTransaction();
      session.endSession();
      session = null;
    }

    if (!useTransactions && createdUserId && !createdPatientId) {
      try {
        await User.findByIdAndDelete(createdUserId);
      } catch (cleanupUserError) {
        console.error('Failed to rollback user after registration error:', cleanupUserError);
      }
    }

    const cleanupDetails = await cleanupFingerprintEnrollment(normalizeFingerprintId(req.body.fingerprintId));

    console.error('Patient registration error:', {
      message: error.message,
      code: error.code,
      usedTransactions: useTransactions,
      fingerprintId: normalizeFingerprintId(req.body.fingerprintId),
      ...cleanupDetails
    });
    if (isDuplicateKeyError(error)) {
      const normalizedPayloadFingerprintId = normalizeFingerprintId(req.body.fingerprintId);
      const matchingPatient = await findMatchingRegisteredPatient({
        fullName: normalizeText(req.body.fullName),
        dob: req.body.dob,
        gender: normalizeText(req.body.gender).toLowerCase(),
        phone: normalizePhoneNumber(req.body.phone),
        bloodGroup: normalizeText(req.body.bloodGroup),
        emergencyName: normalizeText(req.body.emergencyName),
        emergencyPhone: normalizePhoneNumber(req.body.emergencyPhone),
        allergies: req.body.allergies,
        surgeries: req.body.surgeries,
        heightCm: req.body.heightCm,
        weightKg: req.body.weightKg,
        nfcId: normalizeText(req.body.nfcId),
        govtId: normalizeGovtId(req.body.govtId),
        address: normalizeText(req.body.address),
        fingerprintId: normalizedPayloadFingerprintId
      });

      if (matchingPatient) {
        return res.status(200).json(
          buildHospitalRegistrationResponse(matchingPatient, matchingPatient.user, {
            alreadyRegistered: true
          })
        );
      }

      const duplicateFieldFromError = inferDuplicateField(error);
      const duplicateField = duplicateFieldFromError === 'unknown'
        ? await resolveDuplicateFieldByLookup({
          phone: normalizePhoneNumber(req.body.phone),
          govtId: normalizeGovtId(req.body.govtId),
          nfcId: normalizeText(req.body.nfcId),
          fingerprintId: normalizedPayloadFingerprintId,
          createdUserId,
          useTransactions,
          session
        })
        : duplicateFieldFromError;
      const duplicateValue = extractDuplicateValue(error, duplicateField);
      return res.status(409).json({ 
        ...buildRegistrationConflict(duplicateField),
        duplicateValue,
        ...cleanupDetails
      });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: error.message,
        ...cleanupDetails
      });
    }
    return res.status(500).json({
      message: 'Server error while registering patient',
      ...cleanupDetails
    });
  }
};

export const validatePatientRegistrationByHospital = async (req, res) => {
  try {
    const { normalized, error } = validateHospitalRegistrationInput(req.body, {
      requireFingerprint: false
    });

    if (error) {
      return res.status(400).json({
        success: false,
        field: error.field,
        message: error.message
      });
    }

    const age = calculateAge(normalized.dob);
    if (age === null || age < 0) {
      return res.status(400).json({
        success: false,
        field: 'dob',
        message: 'A valid date of birth is required'
      });
    }

    const parsedHeightCm = parseRequiredPositiveNumber(normalized.heightCm, 'Height (cm)');
    if (parsedHeightCm.error) {
      return res.status(400).json({
        success: false,
        field: 'heightCm',
        message: parsedHeightCm.error
      });
    }

    const parsedWeightKg = parseRequiredPositiveNumber(normalized.weightKg, 'Weight (kg)');
    if (parsedWeightKg.error) {
      return res.status(400).json({
        success: false,
        field: 'weightKg',
        message: parsedWeightKg.error
      });
    }

    const matchingPatient = await findMatchingRegisteredPatient(normalized);
    if (matchingPatient) {
      return res.json({
        success: true,
        ...buildHospitalRegistrationResponse(matchingPatient, matchingPatient.user, {
          alreadyRegistered: true
        }),
        normalized: {
          ...normalized,
          age,
          heightCm: parsedHeightCm.value,
          weightKg: parsedWeightKg.value
        }
      });
    }

    const existingPhonePatient = await Patient.findOne({ phone: normalized.phone });
    if (existingPhonePatient) {
      return res.status(409).json({
        success: false,
        ...buildRegistrationConflict('phone')
      });
    }

    const existingGovtIdPatient = await Patient.findOne({ govtId: normalized.govtId });
    if (existingGovtIdPatient) {
      return res.status(409).json({
        success: false,
        ...buildRegistrationConflict('govtId')
      });
    }

    const existingNfcPatient = await Patient.findOne({ nfcUuid: normalized.nfcId });
    if (existingNfcPatient) {
      return res.status(409).json({
        success: false,
        ...buildRegistrationConflict('nfcUuid')
      });
    }

    return res.json({
      success: true,
      message: 'Registration data validated successfully',
      normalized: {
        ...normalized,
        age,
        heightCm: parsedHeightCm.value,
        weightKg: parsedWeightKg.value
      }
    });
  } catch (error) {
    console.error('Registration validation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while validating registration data'
    });
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
      doctor: getAuthorDisplayName(entry),
      hospital: getHospitalDisplayName(entry),
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
          doc.fontSize(10).text(`   Hospital: ${getHospitalDisplayName(record)}`);
          doc.fontSize(10).text(`   Recorded By: ${getAuthorDisplayName(record)}`);
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
