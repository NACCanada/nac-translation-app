# RTMP Translation Mixer - Technical Documentation

## Project Overview

This application provides real-time audio translation overlay for RTMP livestreams. It accepts an incoming RTMP video stream, captures audio from a browser source (typically a translation service), mixes both audio tracks with independent volume controls, and outputs the combined stream to a destination RTMP server (YouTube, Vimeo, etc.).

## Architecture

### Components

1. **Node.js Express Server** (`server.js`)
   - REST API for configuration and control
   - WebSocket server for real-time status updates
   - Coordinates browser audio capture and FFmpeg mixing pipeline

2. **Browser Audio Capture** (`browser-audio.js`)
   - Uses Puppeteer to launch headless Chrome
   - Navigates to translation website
   - Executes automated interactions (clicks, form fills, etc.)
   - Captures audio output from browser

3. **RTMP Mixer** (`mixer.js`)
   - Uses FFmpeg via fluent-ffmpeg wrapper
   - Ingests RTMP video stream (video + audio)
   - Mixes RTMP audio with browser audio
   - Applies independent volume controls
   - Outputs combined stream to RTMP destination

4. **Web Dashboard** (`public/index.html`)
   - Configuration interface
   - Volume controls (0-200% for each source)
   - Browser automation setup
   - Real-time status monitoring
   - Start/stop controls

### Data Flow

```
┌─────────────────┐
│  RTMP Input     │
│  (Video+Audio)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│  Browser Source │────▶│  Puppeteer       │
│  (Translation)  │     │  (Audio Capture) │
└─────────────────┘     └────────┬─────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  FFmpeg Mixer   │
                        │  - Video copy   │
                        │  - Audio mix    │
                        │  - Volume ctrl  │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  RTMP Output    │
                        │  (YouTube/etc)  │
                        └─────────────────┘
```

## Technical Implementation

### FFmpeg Audio Mixing

The mixer uses FFmpeg's complex filter graph to:

1. **Video Passthrough**: `-c:v copy` - No video re-encoding, preserves quality and reduces CPU
2. **Audio Volume Control**: `volume` filter applied independently to each source
3. **Audio Mixing**: `amix` filter combines both audio streams
4. **Output Encoding**: AAC audio codec at 128kbps for RTMP compatibility

**Filter Chain Example:**
```
[0:a]volume=1.0[a0];[1:a]volume=1.5[a1];[a0][a1]amix=inputs=2:duration=longest[aout]
```

### Browser Audio Capture Strategy

Currently, the browser audio capture creates a placeholder for audio extraction. For production, there are several approaches:

1. **Virtual Audio Cable** (Most reliable)
   - PulseAudio on Linux
   - BlackHole on macOS
   - Route browser audio to virtual device, FFmpeg captures from device

2. **Screen/Audio Recording** (Implemented in future versions)
   - Use Puppeteer CDP (Chrome DevTools Protocol)
   - Capture audio streams directly from browser tabs
   - Pipe to FFmpeg via stdin

3. **WebRTC Audio Capture**
   - Page scripts capture getUserMedia audio
   - Stream to WebSocket server
   - Convert to FFmpeg input

### Browser Automation

Puppeteer provides several automation capabilities:

**Action Types:**
- `click` - Click elements by CSS selector or coordinates
- `wait` - Wait for elements to appear (max 30s timeout)
- `type` - Input text into form fields
- `script` - Execute arbitrary JavaScript in page context

**Common Use Cases:**
```javascript
// Auto-play audio
{ "type": "script", "code": "document.querySelector('audio').play();" }

// Click play button after 2 seconds
{ "type": "click", "selector": "#play-btn", "delay": 2000 }

// Wait for player to load
{ "type": "wait", "selector": ".audio-player" }
```

### Real-time Volume Adjustment

Volume changes require FFmpeg process restart because filter graphs cannot be modified at runtime. The implementation:

1. Stops current FFmpeg process gracefully (SIGTERM)
2. Waits for process to end
3. Restarts with new volume parameters
4. Brief interruption (~1-2 seconds) in output stream

**Alternative Approach** (Future improvement):
- Use FFmpeg's `zmq` or `tcp` filter controllers for real-time adjustment
- Requires more complex filter setup but allows seamless volume changes

### WebSocket Status Updates

Dashboard receives real-time updates every 2 seconds:

```javascript
{
  "type": "status",
  "data": {
    "browser": {
      "isRunning": true,
      "hasPage": true,
      "hasBrowser": true
    },
    "mixer": {
      "isRunning": true,
      "config": { /* current settings */ }
    }
  }
}
```

## Configuration Options

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Web server port | 3000 |
| RTMP_INPUT_PORT | RTMP server port | 1935 |
| RTMP_OUTPUT_URL | Destination RTMP server | - |
| RTMP_OUTPUT_KEY | Stream key | - |
| BROWSER_URL | Translation source URL | - |
| BROWSER_WIDTH | Browser viewport width | 1920 |
| BROWSER_HEIGHT | Browser viewport height | 1080 |
| RTMP_AUDIO_VOLUME | RTMP audio level (0-200) | 100 |
| BROWSER_AUDIO_VOLUME | Browser audio level (0-200) | 100 |
| BROWSER_ACTIONS | JSON array of actions | [] |
| BROWSER_CUSTOM_JS | JavaScript to inject | "" |

### Runtime Configuration

All settings can be updated via:
- Web dashboard UI
- REST API (`POST /api/config`)
- Direct modification during operation

## Deployment

### Local Development

**Requirements:**
- Node.js 18+
- FFmpeg installed via system package manager
- Chrome/Chromium (auto-installed by Puppeteer)

**Setup:**
```bash
npm install
cp .env.example .env
npm start
```

### Docker Deployment

**Image includes:**
- Node.js 18
- FFmpeg
- Google Chrome Stable
- All necessary codecs and fonts

**Docker Compose handles:**
- Port mapping (3000 for dashboard, 1935 for RTMP)
- Volume mounting for audio temp files
- Environment variable injection
- Automatic restart on failure
- Increased shared memory for Chrome

**Resource Requirements:**
- Minimum: 2GB RAM, 2 CPU cores
- Recommended: 4GB RAM, 4 CPU cores
- Storage: 1GB for container + temp space

### Production Considerations

1. **RTMP Input Server**
   - Consider using nginx-rtmp-module for more robust RTMP server
   - Current implementation expects external RTMP server on port 1935
   - Could add built-in RTMP server using node-media-server

2. **Security**
   - Add authentication middleware for dashboard
   - Use HTTPS with reverse proxy (nginx/Caddy)
   - Restrict RTMP access by IP whitelist
   - Never expose .env file

3. **Monitoring**
   - Add logging service (Winston, Pino)
   - Stream health checks
   - FFmpeg error tracking
   - Browser crash recovery

4. **Performance**
   - Hardware encoding (NVENC, QuickSync) if available
   - Lower browser resolution to reduce CPU
   - Consider separate server for browser instance
   - Use CDN for RTMP distribution

## API Reference

### REST Endpoints

**GET /api/config**
- Returns current configuration object
- No authentication (add in production)

**POST /api/config**
- Updates configuration
- Body: JSON object with config fields
- Returns: `{ success: true, config: {...} }`

**GET /api/status**
- Returns browser and mixer status
- Used by dashboard for monitoring

**POST /api/start**
- Starts streaming pipeline
- Initializes browser → starts mixer
- Returns: `{ success: true, message: "..." }`

**POST /api/stop**
- Stops streaming pipeline
- Graceful shutdown of mixer and browser
- Returns: `{ success: true, message: "..." }`

**POST /api/volumes**
- Updates volume levels in real-time
- Body: `{ rtmpVolume: 0-200, browserVolume: 0-200 }`
- Restarts mixer with new settings

**POST /api/browser/action**
- Executes single browser action
- Body: Action object (see Browser Automation)
- For manual interaction during streaming

### WebSocket Protocol

**Connection:** `ws://localhost:3000`

**Message Format:**
```json
{
  "type": "status",
  "data": {
    "browser": { "isRunning": true, ... },
    "mixer": { "isRunning": true, ... }
  }
}
```

**Update Interval:** 2 seconds

## Known Limitations & Future Improvements

### Current Limitations

1. **Audio Capture**: Browser audio path is placeholder - needs virtual audio routing
2. **Volume Changes**: Require stream restart (1-2s interruption)
3. **No Authentication**: Dashboard is publicly accessible
4. **Single Stream**: Only one stream can be processed at a time
5. **No RTMP Server**: Requires external RTMP server for input

### Planned Improvements

1. **Implement Real Audio Capture**
   - Chrome DevTools Protocol audio streaming
   - Virtual audio device integration
   - Direct WebRTC capture

2. **Seamless Volume Control**
   - FFmpeg filter control protocol
   - Zero-interruption volume changes

3. **Authentication Layer**
   - Basic auth for dashboard
   - JWT tokens for API
   - RBAC for multi-user scenarios

4. **Multiple Stream Support**
   - Process multiple RTMP inputs simultaneously
   - Separate browser instances per stream
   - Load balancing across servers

5. **Built-in RTMP Server**
   - Accept RTMP input directly
   - No external server dependency
   - Stream authentication

6. **Enhanced Monitoring**
   - Prometheus metrics
   - Grafana dashboards
   - Alert system for failures

7. **Stream Recording**
   - Save output to file
   - VOD archive system
   - Replay capabilities

8. **Advanced Audio Processing**
   - Noise reduction
   - Audio normalization
   - Compression/limiting
   - EQ controls

## Troubleshooting Guide

### Common Issues

**Problem:** Browser won't automate clicks
- **Solution:** Check CSS selectors are correct, add delays between actions, use `wait` action first

**Problem:** No audio in output
- **Solution:** Verify audio capture path exists, check FFmpeg logs, test input sources independently

**Problem:** High CPU usage
- **Solution:** Reduce browser resolution, use hardware encoding, check for memory leaks in browser

**Problem:** Stream lag/buffering
- **Solution:** Increase bitrate, check network bandwidth, reduce video resolution, use faster preset

**Problem:** Docker container crashes
- **Solution:** Increase shared memory, check RAM availability, review logs for specific errors

### Debug Mode

Enable detailed logging:
```bash
# FFmpeg debug output
export DEBUG=fluent-ffmpeg

# Puppeteer debug
export DEBUG=puppeteer:*

npm start
```

### Testing Components Individually

**Test FFmpeg:**
```bash
ffmpeg -i rtmp://input -f flv rtmp://output
```

**Test Puppeteer:**
```bash
node -e "const p = require('puppeteer'); p.launch().then(b => console.log('OK'))"
```

**Test RTMP Input:**
```bash
ffplay rtmp://localhost:1935/live/stream
```

## Development Guide

### Project Structure

```
nac-translation-app/
├── server.js              # Main Express server
├── mixer.js               # FFmpeg pipeline manager
├── browser-audio.js       # Puppeteer automation
├── package.json           # Dependencies
├── Dockerfile             # Container definition
├── docker-compose.yml     # Deployment config
├── .env.example           # Config template
├── public/
│   └── index.html         # Dashboard UI
├── audio-temp/            # Temp audio files (gitignored)
└── README.md              # User documentation
```

### Adding New Features

**New API Endpoint:**
1. Add route in `server.js`
2. Update dashboard UI if needed
3. Document in this file

**New Browser Action:**
1. Add case in `browser-audio.js` `executeAction()`
2. Update dashboard UI with example
3. Document action format

**New FFmpeg Filter:**
1. Modify filter chain in `mixer.js` `start()`
2. Add configuration options
3. Update UI controls

### Testing Checklist

- [ ] RTMP input accepts stream from OBS
- [ ] Browser automation executes all action types
- [ ] Volume controls update in real-time
- [ ] Dashboard WebSocket receives status
- [ ] Docker container builds successfully
- [ ] Output stream reaches YouTube/Vimeo
- [ ] Audio mixing produces correct output
- [ ] Graceful shutdown works properly

## Credits & License

**Technology Stack:**
- Node.js & Express - Web server
- FFmpeg - Media processing
- Puppeteer - Browser automation
- WebSocket - Real-time communication

**License:** MIT

This project was designed for NAC Translation App by Claude (Anthropic).