// ===============================
// Smart-ID Application Constants
// ===============================

// Session & Timeout
export const SESSION_TIMEOUT = 15 * 60 * 1000; // 15 minutes
export const SESSION_DEBOUNCE_DELAY = 1000; // 1 second
export const TOKEN_EXPIRY_OTP = '1h'; // 1 hour for OTP-based login
export const TOKEN_EXPIRY_PASSWORD = '1d'; // 1 day for password-based login

// OTP Configuration
export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MINUTES = 5;
export const MAX_OTP_ATTEMPTS = 3;
export const OTP_RATE_LIMIT_WINDOW = 10 * 60 * 1000; // 10 minutes
export const OTP_RATE_LIMIT_MAX = 5; // 5 requests per window
export const PHONE_RATE_LIMIT_WINDOW = 10 * 60 * 1000; // 10 minutes
export const PHONE_RATE_LIMIT_MAX = 3; // 3 requests per phone per window

// Auth Configuration
export const MIN_PASSWORD_LENGTH = 8;
export const BCRYPT_ROUNDS = 12;
export const AUTH_RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
export const AUTH_RATE_LIMIT_MAX = 10; // 10 attempts per window

// Polling & Sync
export const OFFLINE_POLLING_INTERVAL = 30 * 1000; // 30 seconds
export const NFC_RESCAN_DELAY = 2000; // 2 seconds
export const TOAST_DURATION = 4000; // 4 seconds

// API Configuration
export const API_TIMEOUT = 10000; // 10 seconds
export const MAX_BODY_SIZE = '10kb';
export const MAX_SEARCH_RESULTS = 50;
export const DEFAULT_PAGINATION_LIMIT = 20;

// Validation
export const PHONE_REGEX = /^[6-9]\d{9}$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const GOVT_ID_REGEX = /^[A-Z]{5}\d{4}[A-Z]$/i; // PAN format

// UI Constants
export const SIDEBAR_WIDTH = 280;
export const MOBILE_BREAKPOINT = 768;
export const TABLET_BREAKPOINT = 1024;

// Roles
export const ROLES = {
    ADMIN: 'admin',
    PATIENT: 'patient',
    DOCTOR: 'doctor',
    HOSPITAL: 'hospital',
    MEDICAL_SHOP: 'medical_shop'
};

// Allowed Roles for Self-Registration
export const ALLOWED_REGISTRATION_ROLES = ['patient'];

// Audit Actions
export const AUDIT_ACTIONS = {
    PATIENT_REGISTER: 'PATIENT_REGISTER',
    PATIENT_PROFILE_VIEW: 'PATIENT_PROFILE_VIEW',
    PATIENT_PROFILE_UPDATE: 'PATIENT_PROFILE_UPDATE',
    PATIENT_RECORDS_VIEW: 'PATIENT_RECORDS_VIEW',
    PATIENT_EMR_VIEW: 'PATIENT_EMR_VIEW',
    PATIENT_PRESCRIPTIONS_VIEW: 'PATIENT_PRESCRIPTIONS_VIEW',
    PATIENT_PDF_EXPORT: 'PATIENT_PDF_EXPORT',
    PATIENT_AUDIT_VIEW: 'PATIENT_AUDIT_VIEW',
    CONSENT_REQUEST: 'CONSENT_REQUEST',
    CONSENT_DENIED: 'CONSENT_DENIED',
    EMERGENCY_ACCESS: 'EMERGENCY_ACCESS',
    CONSENT_GRANTED: 'CONSENT_GRANTED',
    CONSENT_REVOKED: 'CONSENT_REVOKED',
    NFC_SCAN: 'NFC_SCAN',
    OTP_SEND: 'OTP_SEND',
    LOGIN_SUCCESS: 'LOGIN_SUCCESS',
    LOGIN_FAILED: 'LOGIN_FAILED',
    CLINICAL_NOTE_ADD: 'CLINICAL_NOTE_ADD',
    ADMIN_USER_CREATE: 'ADMIN_USER_CREATE',
    ADMIN_USER_TOGGLE: 'ADMIN_USER_TOGGLE',
    ADMIN_PERMISSIONS_UPDATE: 'ADMIN_PERMISSIONS_UPDATE'
};

// Consent Status
export const CONSENT_STATUS = {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    REVOKED: 'revoked',
    NOMINEE_APPROVED: 'nominee_approved'
};

// Login Status
export const LOGIN_STATUS = {
    OTP_SENT: 'OTP_SENT',
    NOMINEE_OTP_SENT: 'NOMINEE_OTP_SENT',
    LOGIN_SUCCESS: 'LOGIN_SUCCESS',
    LOGIN_FAILED: 'LOGIN_FAILED',
    NOMINEE_VERIFY_FAILED: 'NOMINEE_VERIFY_FAILED'
};

// Consent Types
export const CONSENT_TYPE = {
    PATIENT: 'PATIENT',
    NOMINEE: 'NOMINEE'
};
