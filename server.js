const express = require('express');
const path = require('path');
const WebSocket = require('ws');
const NodeMediaServer = require('node-media-server');
require('dotenv').config();

const BrowserAudioCapture = require('./browser-audio');
const RTMPMixer = require('./mixer');

const app = express();
const PORT = process.env.PORT || 3000;
const RTMP_PORT = process.env.RTMP_INPUT_PORT || 1935;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Initialize components
const browserAudio = new BrowserAudioCapture();
const mixer = new RTMPMixer();

// Store current configuration
let appConfig = {
  rtmpInput: `rtmp://localhost:${process.env.RTMP_INPUT_PORT || 1935}/live/stream`,
  rtmpOutputUrl: process.env.RTMP_OUTPUT_URL || '',
  rtmpOutputKey: process.env.RTMP_OUTPUT_KEY || '',
  browserUrl: process.env.BROWSER_URL || '',
  browserWidth: parseInt(process.env.BROWSER_WIDTH) || 1920,
  browserHeight: parseInt(process.env.BROWSER_HEIGHT) || 1080,
  rtmpVolume: parseInt(process.env.RTMP_AUDIO_VOLUME) || 100,
  browserVolume: parseInt(process.env.BROWSER_AUDIO_VOLUME) || 100,
  browserActions: [],
  browserCustomJs: process.env.BROWSER_CUSTOM_JS || ''
};

// Parse browser actions from env
try {
  if (process.env.BROWSER_ACTIONS) {
    appConfig.browserActions = JSON.parse(process.env.BROWSER_ACTIONS);
  }
} catch (error) {
  console.error('Failed to parse BROWSER_ACTIONS:', error);
}

// API Routes

// Get current configuration
app.get('/api/config', (req, res) => {
  res.json(appConfig);
});

// Update configuration
app.post('/api/config', async (req, res) => {
  try {
    appConfig = { ...appConfig, ...req.body };
    res.json({ success: true, config: appConfig });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get status
app.get('/api/status', (req, res) => {
  res.json({
    browser: browserAudio.getStatus(),
    mixer: mixer.getStatus()
  });
});

// Start streaming
app.post('/api/start', async (req, res) => {
  try {
    console.log('Starting streaming pipeline...');

    // Start browser audio capture
    await browserAudio.init({
      url: appConfig.browserUrl,
      width: appConfig.browserWidth,
      height: appConfig.browserHeight,
      actions: appConfig.browserActions,
      customJs: appConfig.browserCustomJs
    });

    // Wait a bit for browser to stabilize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get browser audio stream path
    const browserAudioPath = await browserAudio.getAudioStream();

    // Construct output RTMP URL
    const outputRtmpUrl = `${appConfig.rtmpOutputUrl}/${appConfig.rtmpOutputKey}`;

    // Start mixer
    await mixer.start({
      inputRtmpUrl: appConfig.rtmpInput,
      outputRtmpUrl: outputRtmpUrl,
      browserAudioPath: browserAudioPath,
      rtmpVolume: appConfig.rtmpVolume,
      browserVolume: appConfig.browserVolume
    });

    res.json({ success: true, message: 'Streaming started' });
  } catch (error) {
    console.error('Failed to start streaming:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stop streaming
app.post('/api/stop', async (req, res) => {
  try {
    console.log('Stopping streaming pipeline...');
    await mixer.stop();
    await browserAudio.cleanup();
    res.json({ success: true, message: 'Streaming stopped' });
  } catch (error) {
    console.error('Failed to stop streaming:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update volumes
app.post('/api/volumes', async (req, res) => {
  try {
    const { rtmpVolume, browserVolume } = req.body;

    if (rtmpVolume !== undefined) {
      appConfig.rtmpVolume = rtmpVolume;
    }
    if (browserVolume !== undefined) {
      appConfig.browserVolume = browserVolume;
    }

    // Update mixer with new volumes
    await mixer.updateVolumes(appConfig.rtmpVolume, appConfig.browserVolume);

    res.json({ success: true, volumes: { rtmpVolume: appConfig.rtmpVolume, browserVolume: appConfig.browserVolume } });
  } catch (error) {
    console.error('Failed to update volumes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Execute browser action
app.post('/api/browser/action', async (req, res) => {
  try {
    const action = req.body;
    await browserAudio.executeAction(action);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to execute browser action:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Initialize RTMP server
const nmsConfig = {
  rtmp: {
    port: RTMP_PORT,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: 8000,
    allow_origin: '*'
  },
  logType: 3
};

const nms = new NodeMediaServer(nmsConfig);

nms.on('prePublish', (id, StreamPath, args) => {
  console.log('[NodeMediaServer] Stream published:', StreamPath);
});

nms.on('donePublish', (id, StreamPath, args) => {
  console.log('[NodeMediaServer] Stream ended:', StreamPath);
});

// Start RTMP server
nms.run();
console.log(`RTMP Server listening on port ${RTMP_PORT}`);
console.log(`Send your stream to: rtmp://localhost:${RTMP_PORT}/live/stream`);

// WebSocket for real-time status updates
const server = app.listen(PORT, () => {
  console.log(`Web server running on http://localhost:${PORT}`);
  console.log(`Dashboard available at http://localhost:${PORT}`);
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  // Send status updates every 2 seconds
  const statusInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'status',
        data: {
          browser: browserAudio.getStatus(),
          mixer: mixer.getStatus()
        }
      }));
    }
  }, 2000);

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    clearInterval(statusInterval);
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await mixer.stop();
  await browserAudio.cleanup();
  nms.stop();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await mixer.stop();
  await browserAudio.cleanup();
  nms.stop();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});