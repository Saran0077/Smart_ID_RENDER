import AuditLog from '../models/AuditLog.js';
import LoginAudit from '../models/LoginAudit.js';
import Patient from '../models/Patient.js';
import Permission from '../models/Permission.js';
import User from '../models/User.js';
import { fetchUnifiedAuditEvents } from '../utils/auditEventFormatter.js';
import { logAudit } from '../utils/auditLogger.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildPatientAdminResponse = (patient) => ({
  id: patient._id,
  userId: patient.user?._id || patient.user,
  fullName: patient.fullName,
  username: patient.user?.username || null,
  email: patient.user?.email || null,
  phone: patient.phone,
  govtId: patient.govtId,
  dob: patient.dob,
  age: patient.age,
  gender: patient.gender,
  bloodGroup: patient.bloodGroup,
  heightCm: patient.heightCm,
  weightKg: patient.weightKg,
  nfcId: patient.nfcUuid,
  fingerprintId: patient.fingerprintId,
  address: patient.address,
  emergencyContact: patient.emergencyContact,
  allergies: patient.allergies || [],
  surgeries: patient.surgeries || [],
  medicalHistory: patient.medicalHistory || [],
  createdAt: patient.createdAt,
  updatedAt: patient.updatedAt
});

export const getStatistics = async (_req, res) => {
  try {
    const sinceYesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [totalUsers, activeCards, dailyAuditEvents, dailyLoginEvents, emergencyAccess] = await Promise.all([
      User.countDocuments(),
      Patient.countDocuments({ nfcUuid: { $exists: true, $ne: null } }),
      AuditLog.countDocuments({
        createdAt: { $gte: sinceYesterday }
      }),
      LoginAudit.countDocuments({
        createdAt: { $gte: sinceYesterday }
      }),
      AuditLog.countDocuments({ action: /EMERGENCY/i })
    ]);

    res.json({
      totalUsers,
      activeCards,
      dailyScans: dailyAuditEvents + dailyLoginEvents,
      emergencyAccess
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to fetch admin statistics' });
  }
};

export const getAuditLogs = async (req, res) => {
  try {
    await logAudit({
      actor: req.user.id,
      actorRole: req.user.role,
      action: 'ADMIN_AUDIT_VIEW',
      resource: 'AUDIT_LOG',
      ipAddress: req.ip,
      targetType: 'audit',
      targetName: 'Master audit log'
    });

    const logs = await fetchUnifiedAuditEvents({
      auditFilter: {},
      loginFilter: {},
      auditLimit: 150,
      loginLimit: 100
    });

    res.json(logs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to fetch audit logs' });
  }
};

export const getUsers = async (_req, res) => {
  try {
    // Use aggregation pipeline to optimize and combine queries
    const users = await User.aggregate([
      {
        $lookup: {
          from: 'patients',
          localField: '_id',
          foreignField: 'user',
          as: 'patientData'
        }
      },
      {
        $lookup: {
          from: 'loginaudits',
          let: { userPhone: { $arrayElemAt: ['$patientData.phone', 0] } },
          pipeline: [
            { $match: { $expr: { $eq: ['$phone', '$$userPhone'] }, status: 'LOGIN_SUCCESS' } },
            { $sort: { createdAt: -1 } },
            { $limit: 1 }
          ],
          as: 'lastLoginData'
        }
      },
      {
        $project: {
          id: '$_id',
          name: 1,
          role: 1,
          username: 1,
          status: 'active',
          lastLogin: { $arrayElemAt: ['$lastLoginData.createdAt', 0] },
          phone: { $arrayElemAt: ['$patientData.phone', 0] },
          hospital: { $cond: [{ $eq: ['$role', 'hospital'] }, '$name', 'Unified Network'] }
        }
      },
      { $sort: { createdAt: -1 } }
    ]);

    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
};

export const getPatientDetailsByUser = async (req, res) => {
  try {
    const patient = await Patient.findOne({ user: req.params.userId })
      .populate('user', 'name username email role')
      .lean();

    if (!patient) {
      return res.status(404).json({ message: 'Patient details not found for this user' });
    }

    await logAudit({
      actor: req.user.id,
      actorRole: req.user.role,
      action: 'PATIENT_PROFILE_VIEW',
      patient: patient._id,
      resource: 'PATIENT_PROFILE',
      ipAddress: req.ip,
      targetType: 'patient',
      targetId: `${patient._id}`,
      targetName: patient.fullName,
      metadata: { viewedBy: 'admin' }
    });

    res.json(buildPatientAdminResponse(patient));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to fetch patient details' });
  }
};

export const searchPatients = async (req, res) => {
  try {
    const {
      q,
      phone,
      govtId,
      nfcId,
      limit = '20'
    } = req.query;

    const filters = [];

    if (q) {
      filters.push({
        fullName: { $regex: escapeRegex(q.trim()), $options: 'i' }
      });
    }

    if (phone) {
      filters.push({
        phone: { $regex: escapeRegex(phone.trim()) }
      });
    }

    if (govtId) {
      filters.push({ govtId: govtId.trim() });
    }

    if (nfcId) {
      filters.push({ nfcUuid: nfcId.trim() });
    }

    const query = filters.length ? { $and: filters } : {};
    const patients = await Patient.find(query)
      .populate('user', 'name username email role')
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit, 10) || 20, 50))
      .lean();

    await logAudit({
      actor: req.user.id,
      actorRole: req.user.role,
      action: 'PATIENT_SEARCH',
      resource: 'PATIENT_DIRECTORY',
      ipAddress: req.ip,
      targetType: 'search',
      targetName: 'Patient search',
      metadata: {
        q: q || null,
        phone: phone || null,
        govtId: govtId || null,
        nfcId: nfcId || null,
        results: patients.length
      }
    });

    res.json(patients.map(buildPatientAdminResponse));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to search patients' });
  }
};

export const getPermissions = async (_req, res) => {
  try {
    const permissions = await Permission.find().lean();
    
    const formatted = permissions.reduce((acc, perm) => {
      acc[perm.role] = perm.permissions;
      return acc;
    }, {});
    
    res.json(formatted);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to fetch permissions' });
  }
};

export const savePermissions = async (req, res) => {
  try {
    const { role, permissions } = req.body;
    
    if (!role || !permissions) {
      return res.status(400).json({ message: 'Role and permissions are required' });
    }
    
    const updated = await Permission.findOneAndUpdate(
      { role },
      { permissions, updatedAt: new Date() },
      { upsert: true, returnDocument: 'after' }
    );

    await logAudit({
      actor: req.user.id,
      actorRole: req.user.role,
      action: 'ADMIN_PERMISSIONS_UPDATE',
      resource: 'ROLE_PERMISSIONS',
      ipAddress: req.ip,
      targetType: 'role',
      targetId: role,
      targetName: role,
      metadata: { permissions }
    });
    
    res.json({
      success: true,
      message: 'Permissions saved successfully',
      role: updated.role,
      permissions: updated.permissions
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to save permissions' });
  }
};

export const createUser = async (req, res) => {
  try {
    const { name, username, email, password, role } = req.body;
    
    if (!name || !username || !password || !role) {
      return res.status(400).json({ 
        message: 'Name, username, password, and role are required' 
      });
    }
    
    // Password strength validation
    if (password.length < 8) {
      return res.status(400).json({ 
        message: 'Password must be at least 8 characters long' 
      });
    }
    
    if (!/[A-Z]/.test(password)) {
      return res.status(400).json({ 
        message: 'Password must contain at least one uppercase letter' 
      });
    }
    
    if (!/[a-z]/.test(password)) {
      return res.status(400).json({ 
        message: 'Password must contain at least one lowercase letter' 
      });
    }
    
    if (!/[0-9]/.test(password)) {
      return res.status(400).json({ 
        message: 'Password must contain at least one number' 
      });
    }
    
    const validRoles = ['patient', 'doctor', 'hospital', 'medical_shop', 'admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        message: `Invalid role. Must be one of: ${validRoles.join(', ')}` 
      });
    }
    
    const existingUser = await User.findOne({ 
      $or: [
        { username: username.toLowerCase() },
        ...(email ? [{ email: email.toLowerCase() }] : [])
      ]
    });
    
    if (existingUser) {
      return res.status(400).json({ 
        message: 'Username or email already exists' 
      });
    }
    
    const user = new User({
      name,
      username: username.toLowerCase(),
      email: email ? email.toLowerCase() : null,
      password,
      role
    });
    
    await user.save();

    await logAudit({
      actor: req.user.id,
      actorRole: req.user.role,
      action: 'ADMIN_USER_CREATE',
      resource: 'USER_ACCOUNT',
      ipAddress: req.ip,
      targetType: 'user',
      targetId: `${user._id}`,
      targetName: user.name,
      metadata: {
        role: user.role,
        username: user.username
      }
    });
    
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to create user' });
  }
};

export const toggleUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const newStatus = user.isActive ? 'inactive' : 'active';
    user.isActive = !user.isActive;
    await user.save();

    await logAudit({
      actor: req.user.id,
      actorRole: req.user.role,
      action: 'ADMIN_USER_TOGGLE',
      resource: 'USER_ACCOUNT',
      ipAddress: req.ip,
      targetType: 'user',
      targetId: `${user._id}`,
      targetName: user.name,
      metadata: {
        status: newStatus,
        role: user.role,
        username: user.username
      }
    });
    
    res.json({
      success: true,
      message: `User ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
        status: newStatus,
        isActive: user.isActive,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to toggle user status' });
  }
};
