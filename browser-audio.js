const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class BrowserAudioCapture {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isRunning = false;
    this.audioOutputPath = path.join(__dirname, 'audio-temp', 'browser-audio.wav');
    this.ffmpegProcess = null;
    this.audioStream = null;
  }

  async init(config) {
    try {
      // Ensure audio-temp directory exists
      const audioTempDir = path.join(__dirname, 'audio-temp');
      if (!fs.existsSync(audioTempDir)) {
        fs.mkdirSync(audioTempDir, { recursive: true });
      }

      console.log('Launching browser...');
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--autoplay-policy=no-user-gesture-required',
          '--use-fake-ui-for-media-stream',
          '--use-fake-device-for-media-stream',
          '--allow-file-access-from-files',
          '--disable-web-security',
          '--enable-features=AudioServiceOutOfProcess'
        ]
      });

      this.page = await this.browser.newPage();

      // Set viewport
      await this.page.setViewport({
        width: config.width || 1920,
        height: config.height || 1080
      });

      // Enable audio capture
      await this.page.evaluateOnNewDocument(() => {
        navigator.mediaDevices.getUserMedia = navigator.mediaDevices.getUserMedia ||
          navigator.webkitGetUserMedia ||
          navigator.mozGetUserMedia;
      });

      console.log(`Navigating to ${config.url}...`);
      await this.page.goto(config.url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Inject custom JavaScript if provided
      if (config.customJs) {
        console.log('Injecting custom JavaScript...');
        await this.page.evaluate(config.customJs);
      }

      // Execute browser automation actions
      if (config.actions && config.actions.length > 0) {
        console.log(`Executing ${config.actions.length} browser actions...`);
        for (const action of config.actions) {
          await this.executeAction(action);
        }
      }

      this.isRunning = true;
      console.log('Browser audio capture initialized successfully');

      return true;
    } catch (error) {
      console.error('Failed to initialize browser audio capture:', error);
      await this.cleanup();
      throw error;
    }
  }

  async executeAction(action) {
    try {
      const { type, selector, delay, x, y, code } = action;

      // Wait before action if delay specified
      if (delay) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      switch (type) {
        case 'click':
          if (selector) {
            console.log(`Clicking element: ${selector}`);
            await this.page.waitForSelector(selector, { timeout: 10000 });
            await this.page.click(selector);
          } else if (x !== undefined && y !== undefined) {
            console.log(`Clicking at coordinates: (${x}, ${y})`);
            await this.page.mouse.click(x, y);
          }
          break;

        case 'wait':
          if (selector) {
            console.log(`Waiting for element: ${selector}`);
            await this.page.waitForSelector(selector, { timeout: 30000 });
          }
          break;

        case 'type':
          if (selector && code) {
            console.log(`Typing into element: ${selector}`);
            await this.page.waitForSelector(selector, { timeout: 10000 });
            await this.page.type(selector, code);
          }
          break;

        case 'script':
          if (code) {
            console.log('Executing custom script');
            await this.page.evaluate(code);
          }
          break;

        default:
          console.warn(`Unknown action type: ${type}`);
      }
    } catch (error) {
      console.error(`Failed to execute action:`, error);
      // Continue with other actions even if one fails
    }
  }

  async getAudioStream() {
    if (!this.page || !this.isRunning) {
      throw new Error('Browser audio capture not initialized');
    }

    try {
      console.log('Starting browser audio capture via CDP...');

      // Get CDP session
      const client = await this.page.target().createCDPSession();

      // Start capturing audio
      await client.send('Page.setWebLifecycleState', { state: 'active' });

      // Inject audio capture script
      await this.page.evaluate(() => {
        return new Promise((resolve) => {
          // Try to find and play any audio/video elements
          const mediaElements = document.querySelectorAll('audio, video');
          mediaElements.forEach(el => {
            el.muted = false;
            el.volume = 1.0;
            if (el.paused) {
              el.play().catch(e => console.log('Could not autoplay:', e));
            }
          });

          // Create audio context to capture tab audio
          window.audioContext = new (window.AudioContext || window.webkitAudioContext)();

          // Try to capture stream
          if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
            navigator.mediaDevices.getDisplayMedia({
              video: false,
              audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
              }
            }).then(stream => {
              console.log('Audio capture started');
              window.capturedStream = stream;
              resolve(true);
            }).catch(err => {
              console.log('Could not capture audio:', err);
              resolve(false);
            });
          } else {
            resolve(false);
          }
        });
      });

      // Start FFmpeg to create a continuous audio file from pulseaudio/system audio
      // For now, generate a silent placeholder that will loop
      console.log('Generating silent audio placeholder (browser audio capture requires user interaction)...');

      return new Promise((resolve, reject) => {
        this.ffmpegProcess = spawn('ffmpeg', [
          '-f', 'lavfi',
          '-i', 'anullsrc=r=48000:cl=stereo',
          '-t', '3600', // 1 hour
          '-y',
          this.audioOutputPath
        ]);

        this.ffmpegProcess.on('error', (err) => {
          console.error('FFmpeg audio generation error:', err);
          reject(err);
        });

        // Wait a bit for file to be created
        setTimeout(() => {
          if (fs.existsSync(this.audioOutputPath)) {
            console.log('Browser audio file ready (silent placeholder)');
            resolve(this.audioOutputPath);
          } else {
            console.warn('Could not create audio file, returning null');
            resolve(null);
          }
        }, 1000);
      });

    } catch (error) {
      console.error('Failed to capture browser audio:', error);
      return null;
    }
  }

  async updateConfig(config) {
    if (!this.isRunning) {
      return await this.init(config);
    }

    // If URL changed, reinitialize
    if (config.url && this.page) {
      const currentUrl = this.page.url();
      if (currentUrl !== config.url) {
        await this.cleanup();
        return await this.init(config);
      }
    }

    // Execute new actions if provided
    if (config.actions && config.actions.length > 0) {
      for (const action of config.actions) {
        await this.executeAction(action);
      }
    }

    return true;
  }

  async cleanup() {
    console.log('Cleaning up browser audio capture...');
    this.isRunning = false;

    // Kill FFmpeg process
    if (this.ffmpegProcess) {
      try {
        this.ffmpegProcess.kill('SIGTERM');
        this.ffmpegProcess = null;
      } catch (error) {
        console.error('Error killing FFmpeg process:', error);
      }
    }

    if (this.page) {
      try {
        await this.page.close();
      } catch (error) {
        console.error('Error closing page:', error);
      }
      this.page = null;
    }

    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        console.error('Error closing browser:', error);
      }
      this.browser = null;
    }

    // Clean up audio file
    if (fs.existsSync(this.audioOutputPath)) {
      try {
        fs.unlinkSync(this.audioOutputPath);
      } catch (error) {
        console.error('Error deleting audio file:', error);
      }
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      hasPage: !!this.page,
      hasBrowser: !!this.browser
    };
  }
}

module.exports = BrowserAudioCapture;