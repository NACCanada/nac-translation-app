# Windows Deployment Guide

Complete guide for deploying the RTMP Translation Mixer on Windows (native, without Docker).

## Prerequisites

### 1. Install Node.js

1. Download installer: https://nodejs.org/en/download/
2. Run installer (choose LTS version, 18.x or 20.x)
3. Check "Automatically install necessary tools" during setup
4. Verify installation:
```powershell
node --version
npm --version
```

### 2. Install FFmpeg

**Option A - Chocolatey (Recommended):**
```powershell
# Install Chocolatey first (if not installed)
# Run PowerShell as Administrator:
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Then install FFmpeg:
choco install ffmpeg
```

**Option B - Manual Installation:**
1. Download: https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip
2. Extract to `C:\ffmpeg`
3. Add to PATH:
   - Search "Environment Variables" in Start Menu
   - Click "Environment Variables"
   - Under "System variables", find "Path", click "Edit"
   - Click "New", add `C:\ffmpeg\bin`
   - Click OK on all dialogs
4. Verify (restart PowerShell first):
```powershell
ffmpeg -version
```

## Installation

### Step 1: Setup Project

```powershell
# Create project directory
mkdir C:\rtmp-mixer
cd C:\rtmp-mixer

# Upload/copy your project files here
# Or if using git:
git clone <your-repo-url> .

# Install dependencies
npm install
```

### Step 2: Configure Application

```powershell
# Copy example env file
copy .env.example .env

# Edit with notepad or your preferred editor
notepad .env
```

Update these values in `.env`:
```bash
PORT=3001
RTMP_INPUT_PORT=1936
RTMP_OUTPUT_URL=rtmp://a.rtmp.youtube.com/live2
RTMP_OUTPUT_KEY=your-actual-stream-key
AUDIO_MODE=rtmp
VIDEO_BITRATE=10000k
AUDIO_RTMP_URL=
```

### Step 3: Install PM2 Process Manager

```powershell
npm install -g pm2
npm install -g pm2-windows-startup

# Configure PM2 to start on boot
pm2-startup install
```

### Step 4: Start Application

```powershell
cd C:\rtmp-mixer
pm2 start server.js --name rtmp-mixer
pm2 save
```

### Step 5: Configure Windows Firewall

**Run PowerShell as Administrator:**
```powershell
# Allow dashboard port
New-NetFirewallRule -DisplayName "RTMP Mixer Dashboard" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow

# Allow RTMP input port
New-NetFirewallRule -DisplayName "RTMP Input" -Direction Inbound -LocalPort 1936 -Protocol TCP -Action Allow
```

## Accessing the Application

- **Dashboard**: `http://localhost:3001` (local) or `http://your-windows-ip:3001` (network)
- **RTMP Input**: `rtmp://your-windows-ip:1936/live/stream`
- **RTMP Audio Input** (if using RTMP mode): `rtmp://your-windows-ip:1936/live/audio`

## Managing the Application

### View Status
```powershell
pm2 list
```

### View Logs
```powershell
# View all logs
pm2 logs rtmp-mixer

# View last 100 lines
pm2 logs rtmp-mixer --lines 100

# Live monitoring
pm2 monit
```

### Restart Application
```powershell
pm2 restart rtmp-mixer
```

### Stop Application
```powershell
pm2 stop rtmp-mixer
```

### Start Application
```powershell
pm2 start rtmp-mixer
```

### Remove from PM2
```powershell
pm2 delete rtmp-mixer
```

## Troubleshooting

### Port Already in Use

```powershell
# Find what's using the port
netstat -ano | findstr :3001

# Kill the process (replace PID with actual number from above)
taskkill /PID <PID> /F
```

### FFmpeg Not Found

```powershell
# Verify FFmpeg is in PATH
$env:Path -split ';' | Select-String ffmpeg
# Should show C:\ffmpeg\bin or similar

# Test FFmpeg directly
ffmpeg -version
```

### Application Won't Start on Boot

```powershell
# Reinstall PM2 startup
pm2-startup install

# Make sure to save after starting your app
pm2 save

# Verify startup is configured
pm2 startup
```

### High CPU Usage

- Reduce `VIDEO_BITRATE` in `.env` (try 6000k or 8000k)
- Use `preset ultrafast` instead of `fast` (edit `mixer.js` line 136)
- Ensure no other heavy processes are running

### Stream Buffering

- Increase `VIDEO_BITRATE` to 12000k or 15000k
- Check network upload speed (should be 2x your bitrate)
- Reduce RTMP delay if possible

## Advanced Configuration

### Run as Windows Service

For production deployments, you can run PM2 as a Windows Service:

```powershell
npm install -g pm2-windows-service

# Install as service (Run as Administrator)
pm2-service-install -n PM2

# Your PM2 apps now run as a Windows Service
# and will survive logoffs
```

### Update Application

```powershell
cd C:\rtmp-mixer

# Pull latest changes (if using git)
git pull

# Install any new dependencies
npm install

# Restart
pm2 restart rtmp-mixer
```

### Environment Variables

You can also set environment variables directly in PM2:

```powershell
pm2 delete rtmp-mixer
pm2 start server.js --name rtmp-mixer --env production
pm2 save
```

## Performance Optimization

### Recommended Windows Settings

1. **Disable Windows Sleep/Hibernate**
   - Settings → System → Power & Sleep → Never

2. **Set High Performance Power Plan**
   - Control Panel → Power Options → High Performance

3. **Disable Windows Updates Auto-Restart**
   - Settings → Update & Security → Advanced options

4. **Increase Virtual Memory** (if RAM < 16GB)
   - System Properties → Advanced → Performance Settings → Advanced → Virtual Memory

### Resource Requirements

- **Minimum**: 4GB RAM, 2-core CPU, 50GB disk
- **Recommended**: 8GB+ RAM, 4-core+ CPU, 100GB SSD
- **Network**: 20Mbps+ upload bandwidth

## Security Considerations

1. **Firewall**: Only open required ports (3001, 1936)
2. **Authentication**: Add authentication to the dashboard (not included by default)
3. **HTTPS**: Use a reverse proxy (IIS, nginx for Windows) for HTTPS
4. **Stream Keys**: Keep your RTMP output keys secure, never commit to git
5. **Updates**: Regularly update Node.js, FFmpeg, and dependencies

## Support

For issues specific to:
- **Application**: Check logs with `pm2 logs rtmp-mixer`
- **FFmpeg**: Test with `ffmpeg -version` and check PATH
- **Network**: Verify ports with `netstat -ano | findstr :3001`
- **PM2**: Check `pm2 list` and `pm2 startup`

## Windows vs Linux Performance

**Note**: Linux typically provides better performance for this application. If performance is critical, consider:
- Using WSL2 on Windows and following Linux deployment
- Deploying to a Linux VPS (Digital Ocean, AWS, etc.)
- Using Windows Server instead of Windows Desktop

Windows native deployment is suitable for:
- Development/testing
- Small-scale production (1-2 streams)
- Environments where Linux is not available
