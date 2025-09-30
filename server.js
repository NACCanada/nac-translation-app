const express = require('express');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const NodeMediaServer = require('node-media-server');
require('dotenv').config();

const BrowserAudioCapture = require('./browser-audio');
const RTMPMixer = require('./mixer');

const app = express();
const PORT = process.env.PORT || 3000;
const RTMP_PORT = process.env.RTMP_INPUT_PORT || 1935;

// Configuration file path
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Initialize components
const browserAudio = new BrowserAudioCapture();
const mixer = new RTMPMixer();

// Load saved configuration or use defaults
function loadConfig() {
  const defaultConfig = {
    rtmpInput: `rtmp://localhost:${process.env.RTMP_INPUT_PORT || 1935}/live/stream`,
    rtmpOutputUrl: process.env.RTMP_OUTPUT_URL || '',
    rtmpOutputKey: process.env.RTMP_OUTPUT_KEY || '',
    browserUrl: process.env.BROWSER_URL || '',
    browserWidth: parseInt(process.env.BROWSER_WIDTH) || 1920,
    browserHeight: parseInt(process.env.BROWSER_HEIGHT) || 1080,
    rtmpVolume: parseInt(process.env.RTMP_AUDIO_VOLUME) || 100,
    browserVolume: parseInt(process.env.BROWSER_AUDIO_VOLUME) || 100,
    rtmpDelay: parseInt(process.env.RTMP_AUDIO_DELAY) || 0,
    browserDelay: parseInt(process.env.BROWSER_AUDIO_DELAY) || 0,
    videoBitrate: process.env.VIDEO_BITRATE || '6000k',
    browserActions: [],
    browserCustomJs: process.env.BROWSER_CUSTOM_JS || '',
    audioMode: process.env.AUDIO_MODE || 'browser',
    audioDeviceName: process.env.AUDIO_DEVICE_NAME || '',
    audioUrl: process.env.AUDIO_URL || ''
  };

  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const savedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      console.log('Loaded configuration from config.json');
      return { ...defaultConfig, ...savedConfig };
    }
  } catch (error) {
    console.error('Error loading config.json:', error.message);
  }

  console.log('Using default configuration');
  return defaultConfig;
}

// Save configuration to file
function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log('Configuration saved to config.json');
  } catch (error) {
    console.error('Error saving config.json:', error.message);
  }
}

// Store current configuration
let appConfig = loadConfig();

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
    saveConfig(appConfig); // Persist to file
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
    console.log('Audio Mode:', appConfig.audioMode);

    let browserAudioPath = null;

    // Handle different audio modes
    switch (appConfig.audioMode) {
      case 'browser':
        // Browser audio capture with automation
        if (appConfig.browserUrl) {
          try {
            console.log('Attempting to start browser audio capture...');
            await browserAudio.init({
              url: appConfig.browserUrl,
              width: appConfig.browserWidth,
              height: appConfig.browserHeight,
              actions: appConfig.browserActions,
              customJs: appConfig.browserCustomJs,
              mode: 'browser'
            });

            await new Promise(resolve => setTimeout(resolve, 2000));
            browserAudioPath = await browserAudio.getAudioStream();
            console.log('Browser audio capture started successfully');
          } catch (browserError) {
            console.warn('Browser audio capture failed, continuing without it:', browserError.message);
            browserAudioPath = null;
          }
        } else {
          console.log('No browser URL configured, skipping browser audio capture');
        }
        break;

      case 'device':
        // Virtual audio device capture (BlackHole/PulseAudio)
        if (appConfig.audioDeviceName) {
          try {
            console.log(`Capturing from audio device: ${appConfig.audioDeviceName}`);
            await browserAudio.init({
              url: appConfig.browserUrl,
              width: appConfig.browserWidth,
              height: appConfig.browserHeight,
              actions: appConfig.browserActions,
              customJs: appConfig.browserCustomJs,
              mode: 'device',
              deviceName: appConfig.audioDeviceName
            });

            await new Promise(resolve => setTimeout(resolve, 2000));
            browserAudioPath = await browserAudio.getAudioStream();
            console.log('Device audio capture started successfully');
          } catch (deviceError) {
            console.warn('Device audio capture failed, continuing without it:', deviceError.message);
            browserAudioPath = null;
          }
        } else {
          console.warn('No audio device name configured');
        }
        break;

      case 'url':
        // Direct audio URL ingestion
        if (appConfig.audioUrl) {
          console.log(`Using direct audio URL: ${appConfig.audioUrl}`);
          browserAudioPath = appConfig.audioUrl;
        } else {
          console.warn('No audio URL configured');
        }
        break;

      case 'disabled':
        console.log('Audio mixing disabled - RTMP passthrough only');
        break;

      default:
        console.warn(`Unknown audio mode: ${appConfig.audioMode}`);
    }

    // Construct output RTMP URL
    const outputRtmpUrl = `${appConfig.rtmpOutputUrl}/${appConfig.rtmpOutputKey}`;

    // Start mixer (with or without browser audio)
    await mixer.start({
      inputRtmpUrl: appConfig.rtmpInput,
      outputRtmpUrl: outputRtmpUrl,
      browserAudioPath: browserAudioPath,
      rtmpVolume: appConfig.rtmpVolume,
      browserVolume: appConfig.browserVolume,
      rtmpDelay: appConfig.rtmpDelay,
      browserDelay: appConfig.browserDelay,
      videoBitrate: appConfig.videoBitrate
    });

    const message = browserAudioPath
      ? 'Streaming started with browser audio'
      : 'Streaming started (browser audio unavailable)';

    res.json({ success: true, message: message, hasBrowserAudio: !!browserAudioPath });
  } catch (error) {
    console.error('Failed to start streaming:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stop streaming
app.post('/api/stop', async (req, res) => {
  try {
    console.log('Stopping streaming pipeline...');

    // Stop mixer
    try {
      await mixer.stop();
    } catch (mixerError) {
      console.warn('Error stopping mixer:', mixerError.message);
    }

    // Cleanup browser (even if it wasn't started)
    try {
      await browserAudio.cleanup();
    } catch (browserError) {
      console.warn('Error cleaning up browser:', browserError.message);
    }

    res.json({ success: true, message: 'Streaming stopped' });
  } catch (error) {
    console.error('Failed to stop streaming:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update volumes and delays
app.post('/api/volumes', async (req, res) => {
  try {
    const { rtmpVolume, browserVolume, rtmpDelay, browserDelay } = req.body;

    if (rtmpVolume !== undefined) {
      appConfig.rtmpVolume = rtmpVolume;
    }
    if (browserVolume !== undefined) {
      appConfig.browserVolume = browserVolume;
    }
    if (rtmpDelay !== undefined) {
      appConfig.rtmpDelay = rtmpDelay;
    }
    if (browserDelay !== undefined) {
      appConfig.browserDelay = browserDelay;
    }

    // Persist configuration
    saveConfig(appConfig);

    // Update mixer with new volumes and delays
    await mixer.updateVolumes(appConfig.rtmpVolume, appConfig.browserVolume, appConfig.rtmpDelay, appConfig.browserDelay);

    res.json({
      success: true,
      settings: {
        rtmpVolume: appConfig.rtmpVolume,
        browserVolume: appConfig.browserVolume,
        rtmpDelay: appConfig.rtmpDelay,
        browserDelay: appConfig.browserDelay
      }
    });
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