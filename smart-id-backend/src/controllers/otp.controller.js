import Otp from "../models/Otp.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import LoginAudit from "../models/LoginAudit.js";
import Patient from "../models/Patient.js";
import { emitToPatient, emitToMedicalStaff } from "../config/socket.js";
import smsService, { SMS_PROVIDERS } from "../utils/smsService.js";
import { logAudit } from "../utils/auditLogger.js";

const normalizePhone = (phone) => `${phone || ""}`.trim();

const buildOtpPurpose = ({ purpose = "login", isNominee = false, patientId, phone }) => {
    if (isNominee) {
        return `nominee_${patientId}`;
    }

    if (purpose === "login") {
        return `login_${phone}`;
    }

    return `consent_${patientId || phone}`;
};

// Timing-safe OTP comparison to prevent timing attacks
const safeCompareOTP = (inputOtp, storedOtp) => {
    if (!inputOtp || !storedOtp) return false;
    if (inputOtp.length !== storedOtp.length) return false;
    return crypto.timingSafeEqual(
        Buffer.from(inputOtp),
        Buffer.from(storedOtp)
    );
};

// SMS Message Templates
const SMS_MESSAGES = {
    PATIENT: (otp) => `Smart-ID: Your verification OTP is ${otp}. Valid for 5 minutes. Do not share this OTP with anyone.`,
    NOMINEE: (otp, patientName) => `Smart-ID: Emergency consent OTP for ${patientName}'s medical records. OTP: ${otp}. Valid for 5 minutes. This request was made by a hospital for emergency medical care.`
};

// SEND OTP
export const sendOtp = async (req, res) => {
    try {
        const { phone, purpose = 'login', isNominee = false, patientId } = req.body;

        if (!phone) {
            return res.status(400).json({
                error: "Phone number is required"
            });
        }

        let finalPhone = normalizePhone(phone);
        let nomineeName = null;
        let patientName = null;
        let auditPatient = null;

        // If nominee OTP requested, fetch nominee details from patient record
        if (isNominee && patientId) {
            const patient = await Patient.findById(patientId)
                .select('emergencyContact fullName user');

            if (!patient) {
                return res.status(404).json({
                    error: "Patient not found"
                });
            }

            if (!patient.emergencyContact?.phone) {
                return res.status(400).json({
                    error: "Nominee contact not configured for this patient"
                });
            }

            finalPhone = patient.emergencyContact.phone;
            nomineeName = patient.emergencyContact.name || 'Nominee';
            patientName = patient.fullName;
            auditPatient = patient;
        }

        if (!isNominee && purpose === 'login') {
            const patient = await Patient.findOne({ phone: finalPhone }).select('_id fullName user');

            if (!patient) {
                return res.status(404).json({
                    error: "No patient account is linked to this phone number"
                });
            }

            patientName = patient.fullName;
            auditPatient = patient;
        }

        if (!auditPatient && patientId) {
            auditPatient = await Patient.findById(patientId).select('_id fullName user');
            if (auditPatient && !patientName) {
                patientName = auditPatient.fullName;
            }
        }

        // Additional Phone-Level Protection (Security)
        const recentRequests = await LoginAudit.countDocuments({
            phone: finalPhone,
            status: { $in: ['OTP_SENT', 'NOMINEE_OTP_SENT'] },
            createdAt: { $gt: new Date(Date.now() - 10 * 60 * 1000) }
        });

        if (recentRequests >= 3) {
            return res.status(429).json({
                error: "Too many OTP requests for this number. Try again in 10 minutes."
            });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date(Date.now() + 5 * 60 * 1000);

        // Save to Database with purpose to separate login vs consent OTPs
        const otpPurpose = buildOtpPurpose({ purpose, isNominee, patientId, phone: finalPhone });
        
        await Otp.findOneAndUpdate(
            { phone: finalPhone, purpose: otpPurpose },
            { otp, expiresAt: expires, attempts: 0, createdAt: new Date() },
            { upsert: true }
        );

        // Determine SMS message based on recipient type
        const smsMessage = isNominee 
            ? SMS_MESSAGES.NOMINEE(otp, patientName)
            : SMS_MESSAGES.PATIENT(otp);

        let smsDelivered = false;

        try {
            const smsResult = await smsService.send(finalPhone, smsMessage);
            console.log('SMS sent successfully:', smsResult.messageId);
            smsDelivered = true;
        } catch (smsError) {
            console.error('SMS send failed:', smsError.message);
            console.warn('OTP generated but SMS delivery failed. OTP:', otp);

            await LoginAudit.create({
                phone: finalPhone,
                isNominee,
                nomineeName: nomineeName || null,
                patientName: patientName || null,
                patientId: patientId || null,
                ip: req.ip,
                userAgent: req.headers["user-agent"],
                status: "OTP_FAILED"
            });

            if (auditPatient?.user) {
                await logAudit({
                    actor: auditPatient.user,
                    actorRole: isNominee ? 'nominee' : 'patient',
                    action: 'OTP_SEND',
                    patient: auditPatient._id,
                    resource: 'OTP_LOGIN',
                    ipAddress: req.ip,
                    outcome: 'FAILED',
                    targetType: isNominee ? 'nominee' : 'patient',
                    targetId: `${auditPatient._id}`,
                    targetName: auditPatient.fullName,
                    metadata: {
                        phone: finalPhone,
                        isNominee
                    }
                });
            }

            if (smsService.provider !== SMS_PROVIDERS.CONSOLE) {
                return res.status(502).json({
                    error: isNominee ? "Failed to deliver nominee OTP" : "Failed to deliver OTP"
                });
            }

            smsDelivered = true;
        }

        if (smsDelivered) {
            try {
                await LoginAudit.create({
                    phone: finalPhone,
                    isNominee,
                    nomineeName: nomineeName || null,
                    patientName: patientName || null,
                    patientId: patientId || null,
                    ip: req.ip,
                    userAgent: req.headers["user-agent"],
                    status: isNominee ? "NOMINEE_OTP_SENT" : "OTP_SENT"
                });

                if (auditPatient?.user) {
                    await logAudit({
                        actor: auditPatient.user,
                        actorRole: isNominee ? 'nominee' : 'patient',
                        action: 'OTP_SEND',
                        patient: auditPatient._id,
                        resource: 'OTP_LOGIN',
                        ipAddress: req.ip,
                        targetType: isNominee ? 'nominee' : 'patient',
                        targetId: `${auditPatient._id}`,
                        targetName: auditPatient.fullName,
                        metadata: {
                            phone: finalPhone,
                            isNominee
                        }
                    });
                }
            } catch (auditError) {
                console.warn('OTP send bookkeeping failed:', auditError.message);
            }
        }

        // Response - OTP is NOT sent in response for security
        res.json({
            success: true,
            message: isNominee ? "OTP sent to nominee" : "OTP sent",
            isNominee,
            nomineeName: nomineeName || null,
            recipientPhone: finalPhone.slice(0, 3) + '*****' + finalPhone.slice(-4)
        });

        // Emit real-time notification via Socket.IO
        try {
            if (patientId) {
                emitToPatient(patientId, 'otp-status', {
                    status: isNominee ? 'nominee-sent' : 'sent',
                    purpose,
                    recipientPhone: finalPhone.slice(0, 3) + '*****' + finalPhone.slice(-4),
                    timestamp: new Date()
                });
            }

            emitToMedicalStaff('otp-sent', {
                patientId,
                isNominee,
                recipientPhone: finalPhone.slice(0, 3) + '*****' + finalPhone.slice(-4),
                timestamp: new Date()
            });
        } catch (socketError) {
            console.warn('Socket.IO notification failed:', socketError.message);
        }

    } catch (err) {
        console.error(err.response?.data || err);
        res.status(500).json({
            error: "Failed to process OTP request"
        });
    }
};

// VERIFY OTP
export const verifyOtp = async (req, res) => {
    const { phone, otp, purpose = 'login', isNominee = false, patientId } = req.body;

    try {
        const normalizedPhone = normalizePhone(phone);

        if (!normalizedPhone || !otp) {
            return res.status(400).json({ error: "Phone number and OTP are required" });
        }

        // Determine the purpose for lookup
        const otpPurpose = buildOtpPurpose({ purpose, isNominee, patientId, phone: normalizedPhone });
        
        const record = await Otp.findOne({ phone: normalizedPhone, purpose: otpPurpose });

        if (!record) {
            return res.status(400).json({ error: "OTP not found or expired" });
        }

        if (record.expiresAt < new Date()) {
            return res.status(400).json({ error: "OTP expired" });
        }

        // Use timing-safe comparison to prevent timing attacks
        if (!safeCompareOTP(otp, record.otp)) {
            // Atomic increment of attempt counter
            const updatedRecord = await Otp.findOneAndUpdate(
                { phone: normalizedPhone, purpose: otpPurpose, attempts: { $lt: 3 } },
                { $inc: { attempts: 1 } },
                { returnDocument: 'after' }
            );

            if (!updatedRecord || updatedRecord.attempts >= 3) {
                await Otp.deleteOne({ phone: normalizedPhone, purpose: otpPurpose });

                // Get patient info for audit
                let patientInfo = {};
                if (patientId) {
                    const patient = await Patient.findById(patientId).select('emergencyContact fullName user');
                if (patient) {
                    patientInfo = {
                        nomineeName: patient.emergencyContact?.name || null,
                        patientName: patient.fullName,
                        patientUser: patient.user || null,
                        patientDocId: patient._id
                    };
                }
            }

                await LoginAudit.create({
                    phone: normalizedPhone,
                    ip: req.ip,
                    userAgent: req.headers["user-agent"],
                    status: isNominee ? "NOMINEE_VERIFY_FAILED" : "LOGIN_FAILED",
                    attempts: 3,
                    ...patientInfo
                });

                if (patientInfo.patientUser && patientInfo.patientDocId) {
                    await logAudit({
                        actor: patientInfo.patientUser,
                        actorRole: isNominee ? 'nominee' : 'patient',
                        action: 'LOGIN_FAILED',
                        patient: patientInfo.patientDocId,
                        resource: 'OTP_LOGIN',
                        ipAddress: req.ip,
                        outcome: 'FAILED',
                        targetType: isNominee ? 'nominee' : 'patient',
                        targetId: `${patientInfo.patientDocId}`,
                        targetName: patientInfo.patientName,
                        metadata: {
                            phone: normalizedPhone,
                            isNominee
                        }
                    });
                }

                return res.status(403).json({
                    error: "Too many incorrect attempts. Please request a new OTP."
                });
            }

            const attemptsLeft = 3 - (updatedRecord?.attempts || 1);
            return res.status(400).json({ 
                error: "Invalid OTP",
                attemptsLeft
            });
        }

        await Otp.deleteOne({ phone: normalizedPhone, purpose: otpPurpose });

        // Record Audit Event on Success
        await LoginAudit.create({
            phone: normalizedPhone,
            ip: req.ip,
            userAgent: req.headers["user-agent"],
            status: isNominee ? "NOMINEE_CONSENT_GRANTED" : "LOGIN_SUCCESS"
        });

        const verifiedPatient = patientId
            ? await Patient.findById(patientId).select('_id fullName user')
            : await Patient.findOne({ phone: normalizedPhone }).select('_id fullName user');

        if (verifiedPatient?.user) {
            await logAudit({
                actor: verifiedPatient.user,
                actorRole: isNominee ? 'nominee' : 'patient',
                action: isNominee ? 'CONSENT_GRANTED' : 'LOGIN_SUCCESS',
                patient: verifiedPatient._id,
                resource: isNominee ? 'CONSENT_OTP' : 'OTP_LOGIN',
                ipAddress: req.ip,
                targetType: isNominee ? 'nominee' : 'patient',
                targetId: `${verifiedPatient._id}`,
                targetName: verifiedPatient.fullName,
                metadata: {
                    phone: normalizedPhone,
                    isNominee
                }
            });
        }

        // If this is a consent OTP (for clinical notes), return success
        if (purpose === 'consent' || isNominee) {
            return res.json({
                success: true,
                message: isNominee ? "Nominee consent verified" : "OTP verified",
                consentType: isNominee ? "NOMINEE" : "PATIENT"
            });
        }

        // If this is a login OTP, proceed with login
        const patient = await Patient.findOne({ phone: normalizedPhone }).populate('user');

        if (!patient?.user) {
            return res.status(404).json({
                error: "No patient account is linked to this phone number"
            });
        }

        // Reduced JWT expiry from 10 days to 1 hour for better security
        const token = jwt.sign(
            {
                id: patient.user._id,
                patientId: patient._id,
                phone: normalizedPhone,
                role: patient.user.role,
                name: patient.user.name,
                username: patient.user.username
            },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        res.json({
            message: "Login successful",
            success: true,
            token,
            user: {
                id: patient.user._id,
                patientId: patient._id,
                name: patient.user.name,
                username: patient.user.username,
                role: patient.user.role,
                phone: patient.phone
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};
