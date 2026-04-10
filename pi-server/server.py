import os
import time
import uuid
import logging
import threading
import re
import queue
import concurrent.futures
from functools import wraps
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

# CRITICAL FIX: Load environment variables immediately
load_dotenv()

from hardware.fingerprint import FingerprintHardware
from hardware.nfc import NFCHardware
from hardware.gsm import GSMHardware
from state import state_manager, DEFAULT_OPERATION_TIMEOUT

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# ==========================================
# TASK QUEUE FOR ASYNC HARDWARE OPERATIONS
# ==========================================
task_queue = queue.Queue()
results_store = {}

def process_hardware_task(task):
    """Worker function to process hardware tasks from queue"""
    task_id = task['id']
    operation = task['operation']
    timeout = task.get('timeout', 30)
    
    try:
        logger.info(f"Processing task {task_id}: {operation}")
        
        if operation == 'nfc_read' or operation == 'nfc_link':
            # Use NFC logic
            result = nfc.read_card(timeout=timeout)
        elif operation == 'gsm_send':
            with gsm_lock:
                result = gsm.send_sms(task.get('phone'), task.get('message'))
        else:
            result = {'error': f'Unknown operation: {operation}'}
        
        results_store[task_id] = {'status': 'completed', 'result': result, 'timestamp': time.time()}
        logger.info(f"Task {task_id} completed: {operation}")
        
    except Exception as e:
        logger.error(f"Task {task_id} failed: {str(e)}")
        results_store[task_id] = {'status': 'failed', 'error': str(e), 'timestamp': time.time()}

def background_worker():
    """Background thread to process hardware task queue"""
    while True:
        try:
            task = task_queue.get(timeout=1)
            if task is None: break
            process_hardware_task(task)
            task_queue.task_done()
        except queue.Empty:
            continue
        except Exception as e:
            logger.error(f"Background worker error: {e}")

# Start worker
threading.Thread(target=background_worker, daemon=True).start()

def submit_task(operation, timeout=30, **kwargs):
    task_id = str(uuid.uuid4())[:8]
    task = {'id': task_id, 'operation': operation, 'timeout': timeout, **kwargs}
    task_queue.put(task)
    results_store[task_id] = {'status': 'processing', 'timestamp': time.time()}
    return task_id

def get_task_result(task_id):
    return results_store.get(task_id, {'status': 'not_found', 'error': 'Task not found'})

# ==========================================
# AUTHENTICATION & CONFIGURATION
# ==========================================
allowed_origins = os.environ.get('CORS_ORIGINS', 'http://localhost:5173,http://localhost:3000')
origins_list = [o.strip() for o in allowed_origins.split(',') if o.strip()]
CORS(app, origins=origins_list if origins_list else ['*'], supports_credentials=True)

HARDWARE_BRIDGE_KEY = os.environ.get('HARDWARE_BRIDGE_KEY', '')

# Hardware Init
fingerprint = FingerprintHardware(port=os.environ.get('FP_PORT', '/dev/ttyAMA0'), baudrate=int(os.environ.get('FP_BAUD', 57600)))
nfc = NFCHardware()
gsm = GSMHardware(port=os.environ.get('GSM_PORT', '/dev/ttyUSB0'), baudrate=int(os.environ.get('GSM_BAUD', 9600)))

fingerprint_lock = threading.Lock()
gsm_lock = threading.Lock()

def verify_bridge_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not HARDWARE_BRIDGE_KEY:
            logger.error("HARDWARE_BRIDGE_KEY not configured on Pi! Rejecting all requests.")
            return jsonify({"error": "Pi server configuration error", "code": "CONFIG_ERROR"}), 500
        
        # Check standard Authorization or custom x-hardware-key
        provided_key = request.headers.get('x-hardware-key') or \
                       request.headers.get('Authorization', '').replace('Bearer ', '')
        
        if provided_key != HARDWARE_BRIDGE_KEY:
            logger.warning(f"Unauthorized access attempt from {request.remote_addr}")
            return jsonify({"success": False, "error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
        
        return f(*args, **kwargs)
    return decorated_function

def validate_phone_number(phone: str) -> bool:
    if not phone: return False
    return bool(re.match(r'^\+?[1-9]\d{7,14}$', phone.replace(' ', '').replace('-', '')))

# ==========================================
# ROUTES
# ==========================================

@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "online",
        "services": {
            "fingerprint": fingerprint.health_check(),
            "nfc": nfc.health_check(),
            "gsm": gsm.health_check()
        },
        "lastCheck": time.strftime("%Y-%m-%dT%H:%SZ", time.gmtime())
    })

@app.route("/nfc/scan", methods=["POST"])
@verify_bridge_auth
def scan_nfc():
    data = request.get_json() or {}
    task_id = submit_task('nfc_read', timeout=data.get("timeout", 30))
    state_manager.create_operation(task_id, "nfc_scan")
    return jsonify({"success": True, "operationId": task_id, "message": "NFC scan queued"})

@app.route("/nfc/scan/status", methods=["GET"])
@verify_bridge_auth
def scan_nfc_status():
    op_id = request.args.get("operationId")
    if not op_id: return jsonify({"error": "operationId required"}), 400
    
    result = get_task_result(op_id)
    if result['status'] == 'completed':
        res = result['result']
        if res.get("success"):
            return jsonify({"success": True, "nfcId": res.get("nfcId"), "status": "completed"})
        return jsonify({"success": False, "error": res.get("error", "Scan failed"), "status": "failed"}), 400
    
    return jsonify({"success": True, "status": result['status']})

@app.route("/nfc/link-card", methods=["POST"])
@verify_bridge_auth
def link_nfc_card():
    data = request.get_json() or {}
    task_id = submit_task('nfc_link', timeout=data.get("timeout", 30))
    state_manager.create_operation(task_id, "nfc_link")
    return jsonify({"success": True, "operationId": task_id, "message": "NFC link queued"})

@app.route("/nfc/link-card/status", methods=["GET"])
@verify_bridge_auth
def link_nfc_card_status():
    op_id = request.args.get("operationId")
    if not op_id: return jsonify({"error": "operationId required"}), 400
    
    result = get_task_result(op_id)
    if result['status'] == 'completed':
        res = result['result']
        if res.get("success"):
            return jsonify({"success": True, "uid": res.get("nfcId"), "nfcId": res.get("nfcId"), "status": "completed"})
        return jsonify({"success": False, "error": res.get("error", "Link failed"), "status": "failed"}), 400
    
    return jsonify({"success": True, "status": result['status']})

@app.route("/fingerprint/enroll", methods=["POST"])
@verify_bridge_auth
def enroll_fingerprint():
    with fingerprint_lock:
        data = request.get_json() or {}
        single_scan = data.get("singleScan", False)
        result = fingerprint.start_enrollment(single_scan=single_scan)
        
        if "error" in result:
            return jsonify({"success": False, "error": result["error"]}), 400
        
        op_id = str(uuid.uuid4())[:8]
        state_manager.create_operation(op_id, "fingerprint_enroll")
        return jsonify({"success": True, "operationId": op_id, "step": result["step"], "message": result["message"]})

@app.route("/enroll-fingerprint", methods=["POST"])
@verify_bridge_auth
def enroll_fingerprint_alias():
    return enroll_fingerprint()

@app.route("/fingerprint/enroll/status", methods=["GET"])
@verify_bridge_auth
def enroll_fingerprint_status():
    with fingerprint_lock:
        op_id = request.args.get("operationId")
        result = fingerprint.poll_enrollment()
        
        if result.get("step") == "completed":
            return jsonify({"success": True, "completed": True, "fingerprintId": result["fingerprintId"]})
        elif result.get("step") == "failed":
            return jsonify({"success": False, "failed": True, "error": result.get("error")}), 400
            
        return jsonify({"success": True, "step": result.get("step"), "message": result.get("message")})

@app.route("/enroll-fingerprint/status", methods=["GET"])
@verify_bridge_auth
def enroll_fingerprint_status_alias():
    return enroll_fingerprint_status()

@app.route("/enroll-fingerprint/complete", methods=["POST"])
@verify_bridge_auth
def enroll_fingerprint_complete():
    with fingerprint_lock:
        result = fingerprint.poll_enrollment()

        if result.get("step") == "completed":
            return jsonify({
                "success": True,
                "fingerprintId": result.get("fingerprintId"),
                "message": result.get("message", "Enrollment completed successfully")
            })

        if result.get("step") == "failed":
            return jsonify({
                "success": False,
                "failed": True,
                "error": result.get("error"),
                "message": result.get("message", "Enrollment failed")
            }), 400

        return jsonify({
            "success": False,
            "in_progress": True,
            "step": result.get("step"),
            "message": result.get("message", "Enrollment still in progress")
        }), 400

@app.route("/enroll-fingerprint/cancel", methods=["POST"])
@verify_bridge_auth
def enroll_fingerprint_cancel():
    with fingerprint_lock:
        result = fingerprint.cancel_enrollment()
        return jsonify({
            "success": True,
            "message": result.get("message", "Enrollment cancelled")
        })

@app.route("/fingerprint/delete/<int:fingerprint_id>", methods=["DELETE", "POST"])
@verify_bridge_auth
def delete_fingerprint(fingerprint_id):
    with fingerprint_lock:
        result = fingerprint.delete(fingerprint_id)

        if result.get("success"):
            return jsonify({
                "success": True,
                "deletedId": result.get("deletedId", fingerprint_id),
                "message": result.get("message", f"Fingerprint ID {fingerprint_id} deleted")
            })

        return jsonify({
            "success": False,
            "error": result.get("error", "Failed to delete fingerprint")
        }), 400

@app.route("/send-sms", methods=["POST"])
@verify_bridge_auth
def send_sms():
    data = request.get_json()
    if not data or not validate_phone_number(data.get("phone")):
        return jsonify({"success": False, "error": "Invalid phone number"}), 400
    
    with gsm_lock:
        result = gsm.send_sms(data.get("phone"), data.get("message"))
    
    if result.get("success"):
        return jsonify({"success": True, "message": "SMS sent successfully"})
    return jsonify({"success": False, "error": result.get("error")}), 400

@app.route("/operation/<operation_id>", methods=["GET"])
def get_operation(operation_id):
    op = state_manager.get_operation(operation_id)
    if not op: return jsonify({"error": "Not found"}), 404
    return jsonify({"operationId": op.operation_id, "state": op.state.value, "result": op.result})

def initialize_hardware():
    logger.info("Initializing hardware...")
    fingerprint.initialize()
    nfc.initialize()
    gsm.initialize()
    logger.info("Hardware ready.")

def graceful_shutdown(signum, frame):
    logger.info("Closing hardware connections...")
    if gsm.serial: gsm.serial.close()
    import sys
    sys.exit(0)

import signal
signal.signal(signal.SIGTERM, graceful_shutdown)
signal.signal(signal.SIGINT, graceful_shutdown)

if __name__ == "__main__":
    initialize_hardware()
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
