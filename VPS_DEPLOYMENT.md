# VPS FastAPI OCR Server Deployment Guide

## Prerequisites
Make sure your VPS has Python 3.8+ installed and the following packages:

```bash
# Install Python dependencies
pip install fastapi uvicorn paddleocr pillow python-multipart

# For PaddleOCR to work properly, you might also need:
pip install paddlepaddle-cpu  # or paddlepaddle-gpu if you have GPU
```

## Server Setup

1. Place your `scanner.py` file in `/home/container/ocr-project/` on your VPS
2. Start the FastAPI server:

```bash
cd /home/container/ocr-project
uvicorn scanner:app --host 0.0.0.0 --port 8000
```

## Alternative: Using a specific port (if needed)
If you need to run on a different port (like the one in your .env.local):

```bash
uvicorn scanner:app --host 0.0.0.0 --port 22222222
```

## Production Deployment
For production, consider using a process manager like PM2 or systemd:

### Using PM2:
```bash
# Install PM2
npm install -g pm2

# Start the server with PM2
pm2 start "uvicorn scanner:app --host 0.0.0.0 --port 8000" --name ocr-server

# Save PM2 configuration
pm2 save
pm2 startup
```

### Using systemd:
Create a service file at `/etc/systemd/system/ocr-server.service`:

```ini
[Unit]
Description=FastAPI OCR Server
After=network.target

[Service]
Type=simple
User=container
WorkingDirectory=/home/container/ocr-project
ExecStart=/usr/local/bin/uvicorn scanner:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

Then enable and start the service:
```bash
sudo systemctl enable ocr-server
sudo systemctl start ocr-server
```

## Firewall Configuration
Make sure your VPS firewall allows incoming connections on the port you're using:

```bash
# For UFW (Ubuntu)
sudo ufw allow 8000

# For iptables
sudo iptables -A INPUT -p tcp --dport 8000 -j ACCEPT
```

## Testing the Server
Once running, you can test your server:

```bash
curl -X POST "http://your-vps-ip:8000/ocr/" \
     -H "accept: application/json" \
     -H "Content-Type: multipart/form-data" \
     -F "file=@/path/to/test/image.jpg"
```

## Environment Variables
Update your `.env.local` file in your Next.js project:

```
VPS_OCR_URL=http://your-vps-ip:8000
```

Make sure to replace `your-vps-ip` with your actual VPS IP address.
