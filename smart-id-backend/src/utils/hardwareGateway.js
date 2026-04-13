const hardwareBridgeUrl = process.env.HARDWARE_BRIDGE_URL;
const hardwareBridgeKey = process.env.HARDWARE_BRIDGE_KEY;

const HARDWARE_TIMEOUT = 45000; // 45 seconds - matches frontend timeout

const looksLikeHtml = (value) => typeof value === 'string' && /<!doctype html>|<html[\s>]/i.test(value);

const normalizeBridgeErrorMessage = (payload, status) => {
  if (typeof payload === 'string') {
    if (looksLikeHtml(payload)) {
      if (status === 404) {
        return 'Hardware bridge endpoint not found. Verify the Raspberry Pi server routes and deployment version.';
      }

      return `Hardware bridge returned an unexpected HTML error page${status ? ` (status ${status})` : ''}.`;
    }

    return payload;
  }

  return payload?.message ||
    payload?.error ||
    payload?.details ||
    payload?.reason ||
    `Hardware bridge request failed with status ${status}`;
};

const buildHeaders = () => {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (hardwareBridgeKey) {
    headers.Authorization = `Bearer ${hardwareBridgeKey}`;
    headers['x-hardware-key'] = hardwareBridgeKey;
  }

  return headers;
};

export const isHardwareBridgeConfigured = () => Boolean(hardwareBridgeUrl);

export const callHardwareBridge = async (path, options = {}) => {
  if (!hardwareBridgeUrl) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HARDWARE_TIMEOUT);

  try {
    const response = await fetch(`${hardwareBridgeUrl}${path}`, {
      method: options.method || 'GET',
      headers: {
        ...buildHeaders(),
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const message = normalizeBridgeErrorMessage(payload, response.status);
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      error.isTimeout = false;
      throw error;
    }

    return payload;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      const timeoutError = new Error(`Hardware bridge request timed out after ${HARDWARE_TIMEOUT / 1000} seconds`);
      timeoutError.status = 504;
      timeoutError.code = 'HARDWARE_TIMEOUT';
      timeoutError.isTimeout = true;
      throw timeoutError;
    }
    
    throw error;
  }
};

export const normalizeHardwareStatus = (payload) => {
  const services = payload?.services || payload || {};

  return {
    bridgeConfigured: isHardwareBridgeConfigured(),
    nfc: services.nfc || 'unavailable',
    fingerprint: services.fingerprint || 'unavailable',
    gsm: services.gsm || 'unavailable',
    pi: services.pi || services.raspberryPi || 'unavailable',
    database: services.database || payload?.database || 'unknown',
    api: services.api || payload?.api || 'online',
    lastCheck: payload?.lastCheck || new Date().toISOString()
  };
};

const DEFAULT_POLL_INTERVAL = 2000;
const DEFAULT_MAX_ATTEMPTS = 30;

export const pollHardwareBridge = async (operationId, maxAttempts = DEFAULT_MAX_ATTEMPTS, interval = DEFAULT_POLL_INTERVAL) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await callHardwareBridge(`/nfc/scan/status?operationId=${operationId}`);
    
    if (response?.status === 'completed') {
      return {
        success: true,
        nfcId: response.nfcId || response.uid,
        operationId: operationId
      };
    }
    
    if (response?.status === 'failed') {
      throw new Error(response.error || 'NFC scan failed on hardware bridge');
    }
    
    console.log(`Polling attempt ${attempt}/${maxAttempts} for operation ${operationId}...`);
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error('NFC scan timed out - no card detected within 60 seconds');
};

export const pollHardwareBridgeForLink = async (operationId, maxAttempts = DEFAULT_MAX_ATTEMPTS, interval = DEFAULT_POLL_INTERVAL) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await callHardwareBridge(`/nfc/link-card/status?operationId=${operationId}`);
    
    if (response?.status === 'completed') {
      return {
        success: true,
        uid: response.uid || response.nfcId,
        nfcId: response.nfcId || response.uid,
        operationId: operationId
      };
    }
    
    if (response?.status === 'failed') {
      throw new Error(response.error || 'NFC link failed on hardware bridge');
    }
    
    console.log(`Polling attempt ${attempt}/${maxAttempts} for link operation ${operationId}...`);
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error('NFC link timed out - no card detected within 60 seconds');
};
