const SMS_PROVIDERS = {
  TWILIO: 'twilio',
  MSG91: 'msg91',
  BULK_SMS: 'bulk_sms',
  GSM_BRIDGE: 'gsm_bridge',
  CONSOLE: 'console'
};

class SMSService {
  constructor() {
    this.provider = process.env.SMS_PROVIDER || SMS_PROVIDERS.CONSOLE;
    this.config = {
      twilio: {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        fromNumber: process.env.TWILIO_FROM_NUMBER
      },
      msg91: {
        authKey: process.env.MSG91_AUTH_KEY,
        templateId: process.env.MSG91_TEMPLATE_ID,
        senderId: process.env.MSG91_SENDER_ID
      },
      bulkSms: {
        apiKey: process.env.BULK_SMS_API_KEY,
        senderId: process.env.BULK_SMS_SENDER_ID
      },
      gsmBridge: {
        url: process.env.GSM_BRIDGE_URL,
        apiKey: process.env.GSM_BRIDGE_KEY
      }
    };
  }

  async send(phone, message) {
    const normalizedPhone = this.normalizePhone(phone);
    
    if (!normalizedPhone) {
      throw new Error('Invalid phone number');
    }

    if (!message || message.trim().length === 0) {
      throw new Error('Message cannot be empty');
    }

    try {
      switch (this.provider) {
        case SMS_PROVIDERS.TWILIO:
          return await this.sendViaTwilio(normalizedPhone, message);
        case SMS_PROVIDERS.MSG91:
          return await this.sendViaMsg91(normalizedPhone, message);
        case SMS_PROVIDERS.BULK_SMS:
          return await this.sendViaBulkSms(normalizedPhone, message);
        case SMS_PROVIDERS.GSM_BRIDGE:
          return await this.sendViaGsmBridge(normalizedPhone, message);
        case SMS_PROVIDERS.CONSOLE:
        default:
          return await this.sendToConsole(normalizedPhone, message);
      }
    } catch (error) {
      console.error('SMS send error:', error);
      throw error;
    }
  }

  normalizePhone(phone) {
    if (!phone) return null;
    
    let normalized = phone.replace(/[^\d+]/g, '');
    
    if (normalized.startsWith('+91')) {
      return normalized;
    }
    
    if (normalized.startsWith('91') && normalized.length === 12) {
      return '+' + normalized;
    }
    
    if (normalized.length === 10) {
      return '+91' + normalized;
    }
    
    if (normalized.startsWith('0')) {
      normalized = normalized.substring(1);
      return '+91' + normalized;
    }
    
    if (!normalized.startsWith('+')) {
      return '+91' + normalized;
    }
    
    return normalized;
  }

  async sendViaTwilio(phone, message) {
    const { accountSid, authToken, fromNumber } = this.config.twilio;
    
    if (!accountSid || !authToken || !fromNumber) {
      throw new Error('Twilio credentials not configured');
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          To: phone,
          From: fromNumber,
          Body: message
        })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Twilio error: ${error.message}`);
    }

    const result = await response.json();
    return {
      success: true,
      messageId: result.sid,
      provider: 'twilio',
      timestamp: new Date().toISOString()
    };
  }

  async sendViaMsg91(phone, message) {
    const { authKey, templateId, senderId } = this.config.msg91;
    
    if (!authKey) {
      throw new Error('MSG91 auth key not configured');
    }

    const response = await fetch('https://api.msg91.com/api/v5/otp/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authkey': authKey
      },
      body: JSON.stringify({
        mobile: phone.replace('+', ''),
        message: message,
        template_id: templateId,
        sender: senderId || 'SMARTID'
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`MSG91 error: ${error.message}`);
    }

    const result = await response.json();
    return {
      success: true,
      messageId: result.request_id,
      provider: 'msg91',
      timestamp: new Date().toISOString()
    };
  }

  async sendViaBulkSms(phone, message) {
    const { apiKey, senderId } = this.config.bulkSms;
    
    if (!apiKey) {
      throw new Error('Bulk SMS API key not configured');
    }

    const response = await fetch('https://www.bulksmsgateway.bulk247.in/api/send_message.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        api_key: apiKey,
        sender: senderId || 'SMARTID',
        message: message,
        to: [phone.replace('+', '')]
      })
    });

    if (!response.ok) {
      throw new Error(`Bulk SMS error: HTTP ${response.status}`);
    }

    const result = await response.json();
    return {
      success: result.status === 'success',
      messageId: result.response?.[0]?.id,
      provider: 'bulk_sms',
      timestamp: new Date().toISOString()
    };
  }

  async sendViaGsmBridge(phone, message) {
    const { url, apiKey } = this.config.gsmBridge;
    
    if (!url) {
      throw new Error('GSM Bridge URL not configured');
    }

    const endpoint = url.endsWith('/send-sms')
      ? url
      : `${url.replace(/\/$/, '')}/send-sms`;

    const headers = {
      'Content-Type': 'application/json'
    };

    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
      headers['x-hardware-key'] = apiKey;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone: phone,
        message: message,
        source: 'smart-id-backend'
      })
    });

    if (!response.ok) {
      throw new Error(`GSM Bridge error: HTTP ${response.status}`);
    }

    const result = await response.json();
    return {
      success: result.success || result.status === 'sent',
      messageId: result.messageId || result.id,
      provider: 'gsm_bridge',
      timestamp: new Date().toISOString()
    };
  }

  async sendToConsole(phone, message) {
    console.log('\n========== SMS NOTIFICATION ==========');
    console.log(`To:      ${phone}`);
    console.log(`Message: ${message}`);
    console.log(`Provider: Console (development mode)`);
    console.log(`Time:    ${new Date().toISOString()}`);
    console.log('======================================\n');

    return {
      success: true,
      messageId: `console-${Date.now()}`,
      provider: 'console',
      timestamp: new Date().toISOString()
    };
  }

  async sendOtp(phone, otp) {
    const message = `Smart-ID: Your verification OTP is ${otp}. Valid for 5 minutes. Do not share this OTP with anyone.`;
    return this.send(phone, message);
  }

  async sendNomineeOtp(phone, otp, patientName) {
    const message = `Smart-ID: Emergency consent OTP for ${patientName}'s medical records. OTP: ${otp}. Valid for 5 minutes. This request was made by a hospital for emergency medical care.`;
    return this.send(phone, message);
  }

  async sendEmergencyAlert(phone, patientName, hospitalName) {
    const message = `Smart-ID Alert: Emergency access requested for patient ${patientName} at ${hospitalName}. If this was not authorized, please contact support immediately.`;
    return this.send(phone, message);
  }

  getProviderInfo() {
    return {
      provider: this.provider,
      configured: this.isConfigured(),
      available: Object.values(SMS_PROVIDERS)
    };
  }

  isConfigured() {
    switch (this.provider) {
      case SMS_PROVIDERS.TWILIO:
        return !!(this.config.twilio.accountSid && this.config.twilio.authToken);
      case SMS_PROVIDERS.MSG91:
        return !!this.config.msg91.authKey;
      case SMS_PROVIDERS.BULK_SMS:
        return !!this.config.bulkSms.apiKey;
      case SMS_PROVIDERS.GSM_BRIDGE:
        return !!this.config.gsmBridge.url;
      default:
        return true;
    }
  }
}

const smsService = new SMSService();

export default smsService;
export { SMS_PROVIDERS };
