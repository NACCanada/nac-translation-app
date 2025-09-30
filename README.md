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

### Audio Source Modes

The dashboard allows you to choose between different audio capture methods:

#### 1. **Disabled Mode** (Default/Testing)
- RTMP video/audio passes through unchanged
- No translation audio mixing
- Use for testing video passthrough

#### 2. **Browser Mode** (Silent Placeholder)
- Opens translation webpage with automation
- Currently generates silent audio placeholder
- Future: Will capture browser tab audio via CDP
- Good for testing automation scripts

#### 3. **Device Mode** (Recommended for Production)
- Captures from virtual audio device
- **Requires setup**: Install BlackHole (Mac) or PulseAudio (Linux)
- Opens browser and routes audio through virtual device
- FFmpeg captures real audio from device
- **This mode works for actual audio mixing!**

**macOS Setup:**
```bash
brew install blackhole-2ch
# Configure in Audio MIDI Setup (see BROWSER_AUDIO_SETUP.md)
# Set device name to: "BlackHole 2ch"
```

**Linux Setup:**
```bash
pactl load-module module-null-sink sink_name=virtual_speaker
# Set device name to: "virtual_speaker.monitor"
```

#### 4. **URL Mode** (Simplest)
- Directly ingests audio from HTTP/HTTPS URL
- No browser needed
- Perfect if translation service provides audio stream endpoint
- Example: `https://langfinity.ai/audio/event-id.mp3`

**To configure**, use the dashboard's "Audio Source Configuration" section or edit `.env` file.

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

### Volume & Delay Control

**Volume:**
- **RTMP Audio Volume:** 0-200% (100 = original volume)
- **Browser Audio Volume:** 0-200% (100 = original volume)
- Adjust in real-time while streaming

**Delay (Stream Sync):**
- **RTMP Stream Delay:** 0-5000ms (delays video + audio together)
- **Browser Audio Delay:** 0-5000ms (audio only)
- Use to synchronize feeds if one is ahead/behind
- RTMP: Applies FFmpeg `setpts` (video) and `adelay` (audio) filters
- Browser: Applies FFmpeg `adelay` filter
- Updates require stream restart (~1-2s interruption)
- **Note:** RTMP delay requires video re-encoding (uses `libx264 -preset ultrafast`)

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