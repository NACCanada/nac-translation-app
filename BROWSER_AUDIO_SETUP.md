# Browser Audio Capture Setup

Browser audio capture from a headless browser is technically challenging. Here are the options:

## Current Implementation

The app currently generates a **silent audio placeholder** that gets mixed with the RTMP stream. This allows the mixer to work without errors, but doesn't capture actual browser audio.

## Option 1: Virtual Audio Device (Recommended)

### macOS Setup

1. **Install BlackHole** (virtual audio driver):
```bash
brew install blackhole-2ch
```

2. **Create Multi-Output Device**:
   - Open "Audio MIDI Setup" (Applications > Utilities)
   - Click "+" and select "Create Multi-Output Device"
   - Check both "BlackHole 2ch" and your speakers
   - Name it "Multi-Output"

3. **Configure Puppeteer to use BlackHole**:
   - Launch browser with `--autoplay-policy=no-user-gesture-required`
   - Route audio output to BlackHole device
   - FFmpeg captures from BlackHole input

4. **Update browser-audio.js** to capture from BlackHole:
```javascript
// Capture from BlackHole audio device
this.ffmpegProcess = spawn('ffmpeg', [
  '-f', 'avfoundation',
  '-i', ':BlackHole 2ch',  // Audio input device
  '-acodec', 'pcm_s16le',
  '-ar', '48000',
  '-ac', '2',
  this.audioOutputPath
]);
```

### Linux Setup

1. **Install PulseAudio**:
```bash
sudo apt-get install pulseaudio pavucontrol
```

2. **Create virtual sink**:
```bash
pactl load-module module-null-sink sink_name=virtual_speaker
pactl load-module module-loopback source=virtual_speaker.monitor sink=@DEFAULT_SINK@
```

3. **Configure Chrome to use virtual sink**:
```bash
PULSE_SINK=virtual_speaker chromium --no-sandbox
```

4. **Capture from virtual sink**:
```javascript
this.ffmpegProcess = spawn('ffmpeg', [
  '-f', 'pulse',
  '-i', 'virtual_speaker.monitor',
  '-acodec', 'pcm_s16le',
  '-ar', '48000',
  this.audioOutputPath
]);
```

## Option 2: Chrome DevTools Protocol (Complex)

Use CDP to intercept WebAudio API calls and stream audio data:

```javascript
const client = await page.target().createCDPSession();

// Enable WebAudio domain
await client.send('WebAudio.enable');

// Listen for audio nodes
client.on('WebAudio.audioNodeCreated', (event) => {
  console.log('Audio node created:', event);
});

// This requires patching audio data through CDP which is complex
```

**Note**: CDP doesn't directly expose audio stream data, making this approach impractical.

## Option 3: Page Audio Recorder Extension

Install a Chrome extension that records tab audio and saves to disk, then read that file.

**Pros**: Works in headed mode
**Cons**: Requires headed browser, extension installation, file I/O delays

## Option 4: Server-Side Audio Processing

Have the translation service (e.g., langfinity.ai) provide a direct audio stream URL that can be ingested by FFmpeg:

```javascript
// Instead of browser capture, directly ingest audio URL
this.ffmpegProcess = spawn('ffmpeg', [
  '-i', 'https://langfinity.ai/audio-stream/event-id',
  '-acodec', 'pcm_s16le',
  this.audioOutputPath
]);
```

**This is the cleanest approach if the service provides an audio-only stream.**

## Recommended Solution

For production use:

1. **Best**: Get direct audio stream URL from translation service (Option 4)
2. **Good**: Use BlackHole/PulseAudio virtual device (Option 1)
3. **Temporary**: Current silent placeholder (for testing video passthrough)

## Implementation Status

✅ Browser opens webpage and executes automation
✅ Silent audio placeholder prevents mixer errors
❌ Actual audio capture not yet implemented

To enable audio capture, implement Option 1 or Option 4 based on your environment.