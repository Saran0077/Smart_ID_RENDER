# Smart Health Pi Server

Hardware bridge server for the Smart-ID Healthcare Platform running on Raspberry Pi.

## Hardware Requirements

- Raspberry Pi 3/4/Zero 2 W
- R307 Fingerprint Sensor (via UART)
- MFRC522 NFC Reader (via SPI)
- SIM800L GSM Module (via UART or USB)

## Quick Setup

```bash
# Run setup script
chmod +x setup.sh
./setup.sh

# Activate environment and run
source smarthealth_env/bin/activate
python server.py
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | System health check |
| `/nfc/scan` | POST | Scan NFC card |
| `/nfc/scan/status` | GET | Get queued NFC scan result |
| `/enroll-fingerprint` | POST | Start fingerprint enrollment |
| `/enroll-fingerprint/status` | GET | Get enrollment progress |
| `/enroll-fingerprint/complete` | POST | Complete enrollment |
| `/enroll-fingerprint/cancel` | POST | Cancel enrollment |
| `/fingerprint/enroll` | POST | Start fingerprint enrollment (legacy-compatible path) |
| `/fingerprint/enroll/status` | GET | Get enrollment progress (legacy-compatible path) |
| `/send-sms` | POST | Send SMS via GSM |
| `/operation/<id>` | GET | Get operation status |
| `/operation/<id>/cancel` | POST | Cancel operation |

## Example Usage

### Health Check
```bash
curl http://localhost:5001/health
```

### Scan NFC Card
```bash
curl -X POST http://localhost:5001/nfc/scan
```

### Enroll Fingerprint
```bash
# Start enrollment
curl -X POST http://localhost:5001/enroll-fingerprint

# Poll status until completed
curl "http://localhost:5001/enroll-fingerprint/status"

# Complete after polling reports completion
curl -X POST http://localhost:5001/enroll-fingerprint/complete

# Cancel if needed
curl -X POST http://localhost:5001/enroll-fingerprint/cancel
```

### Send SMS
```bash
curl -X POST http://localhost:5001/send-sms \
  -H "Content-Type: application/json" \
  -d '{"phone": "+1234567890", "message": "Your OTP is 123456"}'
```

## Systemd Service

For production deployment:

```bash
sudo cp smart-health.service /etc/systemd/system/
sudo systemctl enable smart-health
sudo systemctl start smart-health
```

## Ngrok for External Access

To expose the Pi server to your backend:

```bash
# Install ngrok
curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
sudo apt update && sudo apt install ngrok

# Authenticate (one time)
ngrok config add-authtoken YOUR_TOKEN

# Start ngrok tunnel
ngrok http 5001
```

## GPIO Pin Configuration

| Hardware | GPIO Pins |
|----------|-----------|
| Fingerprint (UART) | GPIO 14 (TX), GPIO 15 (RX) |
| NFC Reader (SPI) | GPIO 9 (MISO), GPIO 10 (MOSI), GPIO 11 (SCLK), GPIO 8 (CE0) |
| NFC Reader (Reset) | GPIO 25 |
| GSM Module | USB or GPIO 14/15 (shared with fingerprint) |

## Troubleshooting

### Fingerprint sensor not detected
- Check UART is enabled: `sudo raspi-config` → Interface Options → Serial
- Verify wiring: TX→RX, RX→TX, 3.3V→3.3V, GND→GND

### NFC reader not working
- Enable SPI: `sudo raspi-config` → Interface Options → SPI
- Check SPI connection

### GSM module not responding
- Try with USB-to-Serial adapter first
- Verify baud rate (9600 for SIM800L)
- Check power supply (GSM modules need 2A peak)

### Permission denied errors
```bash
sudo usermod -a -G gpio $USER
sudo usermod -a -G dialout $USER
# Then logout and login again
```
