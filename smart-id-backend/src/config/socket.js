import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import AuditLog from '../models/AuditLog.js';
import Consent from '../models/Consent.js';
import { logAudit } from '../utils/auditLogger.js';

let io;

export const initSocketIO = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || '*',
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (error) {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.name} (${socket.user.role})`);

    socket.join(`user:${socket.user.id}`);
    socket.join(`role:${socket.user.role}`);

    if (['hospital', 'doctor'].includes(socket.user.role)) {
      socket.join('medical-staff');
    }

    socket.on('join-patient-room', (patientId) => {
      socket.join(`patient:${patientId}`);
      console.log(`${socket.user.name} joined patient room: ${patientId}`);
    });

    socket.on('leave-patient-room', (patientId) => {
      socket.leave(`patient:${patientId}`);
    });

    socket.on('emergency-alert', async (data) => {
      console.log('Emergency alert received:', data);
      
      io.to('medical-staff').emit('emergency-alert', {
        patientId: data.patientId,
        patientName: data.patientName,
        hospital: socket.user.name,
        timestamp: new Date(),
        severity: data.severity || 'high'
      });

      await logAudit({
        actor: socket.user.id,
        actorRole: socket.user.role,
        action: 'EMERGENCY_ACCESS',
        patient: data.patientId,
        resource: 'EMERGENCY_NOTIFICATION',
        ipAddress: socket.handshake.address,
        targetType: 'patient',
        targetId: `${data.patientId}`,
        targetName: data.patientName || 'Emergency patient',
        metadata: {
          severity: data.severity || 'high'
        }
      });
    });

    socket.on('consent-request', async (data) => {
      console.log('Consent request:', data);
      
      if (data.patientId) {
        io.to(`patient:${data.patientId}`).emit('consent-request', {
          requesterId: socket.user.id,
          requesterName: socket.user.name,
          requesterRole: socket.user.role,
          purpose: data.purpose,
          timestamp: new Date()
        });
      }

      await logAudit({
        actor: socket.user.id,
        actorRole: socket.user.role,
        action: 'CONSENT_REQUEST',
        patient: data.patientId || null,
        resource: 'CONSENT',
        ipAddress: socket.handshake.address,
        targetType: data.patientId ? 'patient' : 'consent',
        targetId: data.patientId ? `${data.patientId}` : null,
        targetName: data.patientName || 'Consent request',
        metadata: {
          purpose: data.purpose || null
        }
      });
    });

    socket.on('otp-sent', (data) => {
      if (data.patientId) {
        io.to(`patient:${data.patientId}`).emit('otp-status', {
          status: 'sent',
          recipientPhone: data.recipientPhone,
          timestamp: new Date()
        });
      }
    });

    socket.on('nfc-scan', async (data) => {
      console.log('NFC scan event:', data);
      
      io.to('medical-staff').emit('nfc-scan-result', {
        uid: data.uid,
        scannedBy: socket.user.name,
        timestamp: new Date()
      });
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user.name}`);
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

export const emitToUser = (userId, event, data) => {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
};

export const emitToRole = (role, event, data) => {
  if (io) {
    io.to(`role:${role}`).emit(event, data);
  }
};

export const emitToMedicalStaff = (event, data) => {
  if (io) {
    io.to('medical-staff').emit(event, data);
  }
};

export const emitToPatient = (patientId, event, data) => {
  if (io) {
    io.to(`patient:${patientId}`).emit(event, data);
  }
};

export const broadcastEmergency = async (emergencyData) => {
  if (io) {
    io.to('medical-staff').emit('emergency-alert', {
      ...emergencyData,
      timestamp: new Date()
    });
  }
};

export const notifyConsentUpdate = async (consentId, status, patientId) => {
  if (io) {
    io.to(`patient:${patientId}`).emit('consent-update', {
      consentId,
      status,
      timestamp: new Date()
    });
    
    io.to('medical-staff').emit('consent-update', {
      consentId,
      status,
      patientId,
      timestamp: new Date()
    });
  }
};
