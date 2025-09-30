# RTMP Translation Mixer

A real-time RTMP livestream mixer that overlays translated audio from a browser source onto an incoming video stream. Perfect for live translation of streams to YouTube, Vimeo, or any RTMP destination.

## Features

- ✅ **RTMP Video Passthrough** - Preserves incoming video stream quality
- 🎙️ **Audio Mixing** - Combines original RTMP audio with browser-sourced translated audio
- 🎚️ **Independent Volume Control** - Adjust RTMP and browser audio levels independently (0-200%)
- 🌐 **Browser Automation** - Automated clicks, form fills, and JavaScript injection
- 📊 **Web Dashboard** - Easy-to-use control panel
- 🐳 **Docker Support** - Deploy to Digital Ocean or run locally
- 🔄 **Real-time Configuration** - Update settings without stopping the stream

## Architecture

```
RTMP Input (video + audio) → FFmpeg
                              ↓
Browser Source (audio) ─────→ Audio Mixer → FFmpeg → RTMP Output
                              ↓
                         Volume Controls
```

## Prerequisites

### Local Development (Mac/Linux)
- Node.js 18+
- FFmpeg installed: `brew install ffmpeg` (Mac) or `apt-get install ffmpeg` (Linux)
- Chrome/Chromium (installed automatically by Puppeteer)

### Production (Digital Ocean Droplet)
- Docker & Docker Compose
- At least 2GB RAM recommended
- Open ports: 3000 (dashboard), 1935 (RTMP input)

## Installation

### Local Setup

1. **Clone and install dependencies:**
```bash
cd nac-translation-app
npm install
```

2. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with your settings
```

3. **Start the server:**
```bash
npm start
```

4. **Access dashboard:**
Open http://localhost:3000

### Docker Setup (Digital Ocean)

1. **Create .env file:**
```bash
cp .env.example .env
# Edit .env with your settings
```

2. **Build and run:**
```bash
docker-compose up -d
```

3. **View logs:**
```bash
docker-compose logs -f
```

4. **Access dashboard:**
Open http://your-droplet-ip:3000

## Configuration

### RTMP Settings

**Input RTMP URL:**
- Format: `rtmp://localhost:1935/live/stream`
- This is where you send your source stream (via OBS, etc.)

**Output RTMP Server:**
- YouTube: `rtmp://a.rtmp.youtube.com/live2`
- Vimeo: `rtmp://live.vimeo.com/live`

**Stream Key:**
- Get from YouTube/Vimeo dashboard
- Keep this secret!

### Browser Audio Source

**URL:** The webpage with translated audio (e.g., translation service)

**Dimensions:** Browser viewport size (1920x1080 recommended)

**⚠️ IMPORTANT - Audio Capture Limitations:**

Currently, the browser opens and automates the webpage, but **actual audio capture is not yet implemented**. The app generates a silent audio placeholder to prevent errors.

**To enable real audio capture**, see `BROWSER_AUDIO_SETUP.md` for:
- Virtual audio device setup (BlackHole/PulseAudio)
- Direct audio stream URL ingestion
- Alternative capture methods

For now, the RTMP video/audio will pass through without browser audio mixing.

### Browser Automation

Configure automated interactions with the translation webpage:

**Example Actions (JSON):**
```json
[
  {
    "type": "click",
    "selector": "#play-button",
    "delay": 1000
  },
  {
    "type": "wait",
    "selector": ".audio-player",
    "delay": 500
  },
  {
    "type": "click",
    "selector": "#start-translation"
  }
]
```

**Action Types:**
- `click` - Click an element (selector or x/y coordinates)
- `wait` - Wait for element to appear
- `type` - Type text into an input field
- `script` - Execute custom JavaScript

**Custom JavaScript:**
```javascript
// Auto-play audio
document.querySelector('audio').play();

// Unmute
document.querySelector('#mute-button').click();
```

### Volume Control

- **RTMP Audio Volume:** 0-200% (100 = original volume)
- **Browser Audio Volume:** 0-200% (100 = original volume)
- Volumes can be adjusted in real-time while streaming

## Usage Workflow

1. **Configure Settings:**
   - Set RTMP input/output URLs
   - Add browser source URL
   - Configure browser automation actions
   - Click "Save Configuration"

2. **Start Your Source Stream:**
   - Use OBS or other streaming software
   - Send to: `rtmp://your-server:1935/live/stream`

3. **Start Mixing:**
   - Click "Start Streaming" in dashboard
   - Browser will open and execute automation
   - Audio mixing begins automatically

4. **Adjust Volumes:**
   - Use sliders to control audio levels
   - Click "Apply Volume Changes"

5. **Monitor Status:**
   - Green indicators show active components
   - Check browser and mixer status in real-time

6. **Stop Streaming:**
   - Click "Stop Streaming" when done

## Sending Stream to the Mixer

**Using OBS Studio:**

1. Open OBS Settings → Stream
2. Select "Custom" service
3. Server: `rtmp://localhost:1935/live` (or your server IP)
4. Stream Key: `stream`
5. Click "Apply" and "Start Streaming"

**Using FFmpeg CLI:**
```bash
ffmpeg -re -i input.mp4 -c:v libx264 -c:a aac -f flv rtmp://localhost:1935/live/stream
```

## Troubleshooting

### Browser won't load audio
- Check browser automation actions are correct
- Verify custom JavaScript syntax
- Check browser console (add logging to custom JS)

### No audio mixing
- Ensure FFmpeg is installed: `ffmpeg -version`
- Check audio-temp directory exists and is writable
- Verify input stream has audio: `ffplay rtmp://localhost:1935/live/stream`

### Stream not outputting
- Verify output RTMP URL and stream key
- Check YouTube/Vimeo stream settings
- Test with: `ffplay rtmp://output-url/stream-key`

### High CPU usage
- Browser automation may be resource-intensive
- Consider reducing browser resolution
- Use hardware acceleration in FFmpeg (if available)

### Docker container crashes
- Increase shared memory: `shm_size: '2gb'` in docker-compose.yml
- Check logs: `docker-compose logs rtmp-mixer`
- Ensure enough RAM available (2GB+ recommended)

## API Endpoints

The application exposes a REST API:

- `GET /api/config` - Get current configuration
- `POST /api/config` - Update configuration
- `GET /api/status` - Get system status
- `POST /api/start` - Start streaming
- `POST /api/stop` - Stop streaming
- `POST /api/volumes` - Update volume levels
- `POST /api/browser/action` - Execute browser action

WebSocket endpoint for real-time status: `ws://localhost:3000`

## Security Notes

- **Keep your stream keys secret** - Never commit .env to git
- **Firewall configuration** - Only expose necessary ports (3000, 1935)
- **HTTPS recommended** - Use reverse proxy (nginx) with SSL for production
- **Authentication** - Consider adding auth middleware for dashboard access

## Performance Tips

- Use hardware encoding (NVENC, QuickSync) if available
- Reduce browser resolution if CPU usage is high
- Use `libx264 -preset ultrafast` for lower latency
- Consider dedicated server for production use

## License

MIT

## Support

For issues and questions, please check the troubleshooting section or review the code comments.