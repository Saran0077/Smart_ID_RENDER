from typing import Optional, Dict, Any
from enum import Enum
import time

try:
    from pyfingerprint.pyfingerprint import PyFingerprint
    FINGERPRINT_AVAILABLE = True
except ImportError:
    try:
        from pyfingerprint import PyFingerprint
        # PyFingerprint imported correctly - no alias needed
        FINGERPRINT_AVAILABLE = True
    except ImportError:
        FINGERPRINT_AVAILABLE = False


class EnrollmentStep(Enum):
    IDLE = "idle"
    WAITING_FIRST = "waiting_first_scan"
    WAITING_SECOND = "waiting_second_scan"
    COMPLETED = "completed"
    FAILED = "failed"


class FingerprintHardware:
    def __init__(self, port='/dev/ttyAMA0', baudrate=57600, password=0xFFFFFFFF, address=0x00000000):
        self.port = port
        self.baudrate = baudrate
        self.password = password
        self.address = address
        self.finger: Optional[PyFingerprint] = None
        self._is_initialized = False
        
        self._enrollment_step = EnrollmentStep.IDLE
        self._temp_characteristics = None
        self._stored_fingerprint_id: Optional[int] = None
        self._step_start_time: float = 0
        self._timeout_seconds = 30  # FIX 2: Changed from 60 to 30 (match frontend polling)
        self._single_scan_mode = False  # Single scan mode flag

    def initialize(self) -> Dict[str, Any]:
        if not FINGERPRINT_AVAILABLE:
            return {
                "available": False,
                "error": "pyfingerprint library not installed"
            }
        
        try:
            self.finger = PyFingerprint(self.port, self.baudrate, self.password, self.address)
            
            if not self.finger.verifyPassword():
                return {
                    "available": False,
                    "error": "Fingerprint sensor password verification failed"
                }
            
            self._is_initialized = True
            self._reset_enrollment()
            
            return {
                "available": True,
                "status": "ready",
                "sensor_info": self._get_sensor_info()
            }
        except Exception as e:
            return {
                "available": False,
                "error": str(e)
            }

    def _get_sensor_info(self) -> Dict[str, Any]:
        if not self.finger:
            return {}
        
        try:
            return {
                "capacity": self.finger.getStorageCapacity(),
                "library_size": self.finger.getTemplateCount()
            }
        except:
            return {}

    def health_check(self) -> Dict[str, Any]:
        if not self._is_initialized or not self.finger:
            return {"status": "unavailable"}
        
        try:
            self.finger.verifyPassword()
            return {
                "status": "online",
                "available": True,
                "info": self._get_sensor_info()
            }
        except Exception as e:
            return {
                "status": "error",
                "available": False,
                "error": str(e)
            }

    def _reset_enrollment(self):
        self._enrollment_step = EnrollmentStep.IDLE
        self._temp_characteristics = None
        self._stored_fingerprint_id = None
        self._step_start_time = 0
        self._single_scan_mode = False

    def _check_timeout(self) -> bool:
        if time.time() - self._step_start_time > self._timeout_seconds:
            self._enrollment_step = EnrollmentStep.FAILED
            return True
        return False

    def start_enrollment(self, single_scan: bool = False) -> Dict[str, Any]:
        if not self._is_initialized:
            return {"error": "Fingerprint sensor not initialized"}
        
        if self._enrollment_step != EnrollmentStep.IDLE:
            return {
                "error": "Enrollment already in progress",
                "step": self._enrollment_step.value
            }
        
        self._reset_enrollment()
        self._enrollment_step = EnrollmentStep.WAITING_FIRST
        self._step_start_time = time.time()
        self._single_scan_mode = single_scan
        
        return {
            "success": True,
            "step": "place_finger",
            "message": "Place finger on sensor",
            "singleScan": single_scan
        }

    def poll_enrollment(self) -> Dict[str, Any]:
        """FIX 1: Non-blocking enrollment polling - single check per call"""
        print(f"[FINGERPRINT] poll_enrollment called. Step: {self._enrollment_step.value}, SingleScan: {self._single_scan_mode}")
        
        # Check enrollment state - return immediately without blocking
        if self._enrollment_step == EnrollmentStep.IDLE:
            print("[FINGERPRINT] Step is IDLE - returning idle")
            return {"step": "idle", "message": "No enrollment in progress"}
        
        if self._enrollment_step == EnrollmentStep.COMPLETED:
            print("[FINGERPRINT] Step is COMPLETED - returning success")
            return {
                "step": "completed",
                "fingerprintId": self._stored_fingerprint_id,
                "message": "Enrollment successful"
            }
        
        if self._enrollment_step == EnrollmentStep.FAILED:
            print("[FINGERPRINT] Step is FAILED - returning failure")
            return {
                "step": "failed",
                "error": "Enrollment timed out or failed",
                "message": "Please restart enrollment"
            }
        
        # Check timeout - non-blocking check
        if self._check_timeout():
            self._enrollment_step = EnrollmentStep.FAILED
            return {
                "step": "failed",
                "error": "Timeout - no finger detected",
                "message": "Please try again"
            }
        
        # Non-blocking single check - just check once and return
        # Frontend polls every 2 seconds, so this will be called repeatedly
        try:
            print("[FINGERPRINT] Checking for finger (single non-blocking check)...")
            
            # Check if finger is on sensor
            if self.finger.readImage():
                print("[FINGERPRINT] Finger detected! Processing...")
                self.finger.convertImage(0x01)
                
                result = self.finger.searchTemplate()
                position = result[0]
                print(f"[FINGERPRINT] Template search result: position={position}")
                
                # If finger already exists at a position
                if position >= 0:
                    print(f"[FINGERPRINT] Finger already enrolled at position {position}")
                    
                    # Find next available position
                    empty_position = -1
                    capacity = self.finger.getStorageCapacity()
                    for try_pos in range(position + 1, min(position + 100, capacity)):
                        try:
                            self.finger.loadTemplate(try_pos)
                        except Exception:
                            empty_position = try_pos
                            break
                    
                    if empty_position < 0:
                        print("[FINGERPRINT] ERROR: No empty positions available!")
                        self._reset_enrollment()
                        return {
                            "step": "failed",
                            "error": "No empty fingerprint slots available"
                        }
                    
                    # Store at new position
                    print(f"[FINGERPRINT] Storing at new position {empty_position}...")
                    self._temp_characteristics = self.finger.downloadCharacteristics(0x01)
                    
                    if self._single_scan_mode:
                        self.finger.createTemplate()
                        self.finger.storeTemplate(empty_position)
                        self._stored_fingerprint_id = empty_position
                        self._enrollment_step = EnrollmentStep.COMPLETED
                        print(f"[FINGERPRINT] SUCCESS! Stored at {empty_position}")
                        
                        return {
                            "step": "completed",
                            "fingerprintId": empty_position,
                            "message": f"Fingerprint enrolled at position {empty_position}"
                        }
                
                # New fingerprint - download characteristics
                print("[FINGERPRINT] New fingerprint detected, downloading...")
                self._temp_characteristics = self.finger.downloadCharacteristics(0x01)
                
                if self._single_scan_mode:
                    print("[FINGERPRINT] SINGLE SCAN MODE: Creating template...")
                    self.finger.createTemplate()
                    position = self.finger.storeTemplate()
                    self._stored_fingerprint_id = position
                    self._enrollment_step = EnrollmentStep.COMPLETED
                    print(f"[FINGERPRINT] SUCCESS! Stored at position {position}")
                    
                    return {
                        "step": "completed",
                        "fingerprintId": position,
                        "message": "Fingerprint enrolled successfully (single scan)"
                    }
                
                # Two-scan mode - move to second step
                print("[FINGERPRINT] TWO SCAN MODE: Move to second scan...")
                self._enrollment_step = EnrollmentStep.WAITING_SECOND
                self._step_start_time = time.time()
                
                return {
                    "step": "remove_finger",
                    "message": "Remove finger, then place same finger again"
                }
            else:
                # No finger detected - return waiting status (non-blocking)
                elapsed = time.time() - self._step_start_time
                remaining = int(self._timeout_seconds - elapsed)
                
                print(f"[FINGERPRINT] No finger detected. Time remaining: {remaining}s")
                
                return {
                    "step": self._enrollment_step.value,
                    "message": "Waiting for finger...",
                    "timeout_remaining": max(0, remaining)
                }
                
        except Exception as e:
            print(f"[FINGERPRINT] Exception during scan: {type(e).__name__}: {e}")
            return {
                "step": "failed",
                "error": f"Scan error: {str(e)}",
                "message": "Please try again"
            }
    
    def _find_empty_position(self, start_position: int) -> int:
        """Find the next empty position starting from start_position"""
        try:
            for try_pos in range(start_position + 1, min(start_position + 100, self.finger.getStorageCapacity())):
                try:
                    self.finger.loadTemplate(try_pos)
                except Exception:
                    return try_pos
            return -1
        except Exception:
            return -1

    def verify(self, fingerprint_id: Optional[int] = None) -> Dict[str, Any]:
        if not self._is_initialized or not self.finger:
            return {"error": "Fingerprint sensor not initialized"}
        
        try:
            if not self.finger.readImage():
                return {
                    "verified": False,
                    "status": "waiting",
                    "message": "Place finger on sensor"
                }
            
            self.finger.convertImage(0x01)
            result = self.finger.searchTemplate()
            position = result[0]
            
            if position < 0:
                return {
                    "verified": False,
                    "status": "not_found",
                    "message": "Fingerprint not enrolled"
                }
            
            if fingerprint_id is not None and position != fingerprint_id:
                return {
                    "verified": False,
                    "status": "mismatch",
                    "message": f"Expected ID {fingerprint_id}, found {position}",
                    "foundId": position
                }
            
            return {
                "verified": True,
                "fingerprintId": position,
                "message": "Fingerprint verified successfully"
            }
        
        except Exception as e:
            return {
                "verified": False,
                "error": str(e)
            }

    def delete(self, fingerprint_id: int) -> Dict[str, Any]:
        if not self._is_initialized or not self.finger:
            return {"error": "Fingerprint sensor not initialized"}
        
        try:
            self.finger.deleteTemplate(fingerprint_id)
            return {
                "success": True,
                "deletedId": fingerprint_id,
                "message": f"Fingerprint ID {fingerprint_id} deleted"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    def remove(self, fingerprint_id: int) -> Dict[str, Any]:
        return self.delete(fingerprint_id)

    def cancel_enrollment(self):
        self._reset_enrollment()
        return {"success": True, "message": "Enrollment cancelled"}

    def reset_enrollment(self):
        self._reset_enrollment()
        return {"success": True, "message": "Enrollment state reset"}

    def get_enrollment_status(self) -> Dict[str, Any]:
        return {
            "step": self._enrollment_step.value,
            "fingerprintId": self._stored_fingerprint_id,
            "timeout_active": self._step_start_time > 0 and self._enrollment_step not in [EnrollmentStep.IDLE, EnrollmentStep.COMPLETED, EnrollmentStep.FAILED]
        }

    def capture_fingerprint(self, scan_number: int = 1) -> Dict[str, Any]:
        if not self._is_initialized or not self.finger:
            return {"success": False, "error": "Fingerprint sensor not initialized"}
        
        try:
            self._step_start_time = time.time()
            self._timeout_seconds = 45
            
            if self.finger.readImage():
                self.finger.convertImage(0x01)
                
                result = self.finger.searchTemplate()
                position = result[0]
                
                if position >= 0:
                    return {
                        "success": False,
                        "error": f"Finger already enrolled (ID: {position})"
                    }
                
                characteristics = self.finger.downloadCharacteristics(0x01)
                
                return {
                    "success": True,
                    "scanData": {
                        "characteristics": list(characteristics) if characteristics else [],
                        "scanNumber": scan_number
                    },
                    "message": f"Scan {scan_number} captured successfully"
                }
            else:
                return {
                    "success": False,
                    "error": "No finger detected. Please place finger on sensor."
                }
        
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    def cancel_capture(self):
        self._step_start_time = 0
        return {"success": True, "message": "Capture cancelled"}
