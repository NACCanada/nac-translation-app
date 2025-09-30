const ffmpeg = require('fluent-ffmpeg');
const path = require('path');

class RTMPMixer {
  constructor() {
    this.ffmpegProcess = null;
    this.isRunning = false;
    this.config = {
      inputRtmpUrl: '',
      outputRtmpUrl: '',
      browserAudioPath: '',
      rtmpVolume: 100,
      browserVolume: 100,
      rtmpDelay: 0,
      browserDelay: 0,
      videoBitrate: '6000k'
    };
  }

  async start(config) {
    if (this.isRunning) {
      console.log('Mixer already running, stopping first...');
      await this.stop();
    }

    this.config = { ...this.config, ...config };

    try {
      // Convert volume percentage to FFmpeg filter value
      // 100% = 1.0, 200% = 2.0, 50% = 0.5
      const rtmpVolumeFilter = this.config.rtmpVolume / 100;
      const browserVolumeFilter = this.config.browserVolume / 100;

      // Convert delay from milliseconds to seconds
      const rtmpDelaySeconds = this.config.rtmpDelay / 1000;
      const browserDelaySeconds = this.config.browserDelay / 1000;

      console.log('Starting RTMP mixer...');
      console.log('Input RTMP:', this.config.inputRtmpUrl);
      console.log('Output RTMP:', this.config.outputRtmpUrl);
      console.log('Browser Audio:', this.config.browserAudioPath ? 'Enabled' : 'Disabled');
      console.log('RTMP Volume:', this.config.rtmpVolume);
      console.log('Browser Volume:', this.config.browserVolume);
      console.log('RTMP Delay:', this.config.rtmpDelay, 'ms');
      console.log('Browser Delay:', this.config.browserDelay, 'ms');
      console.log('Video Codec:', rtmpDelaySeconds > 0 ? `libx264 @ ${this.config.videoBitrate}` : 'copy (passthrough)');

      this.ffmpegProcess = ffmpeg();

      // Input 1: RTMP stream (video + audio)
      this.ffmpegProcess.input(this.config.inputRtmpUrl)
        .inputOptions([
          '-thread_queue_size', '512',
          '-re',
          '-fflags', '+genpts'
        ]);

      // Input 2: Browser audio (if available)
      if (this.config.browserAudioPath) {
        this.ffmpegProcess.input(this.config.browserAudioPath)
          .inputOptions([
            '-re',                // Read at native frame rate
            '-stream_loop', '-1', // Loop the audio file
            '-thread_queue_size', '1024',
            '-fflags', '+igndts'  // Ignore DTS on separate streams
          ]);
      }

      // Complex filter for audio mixing with delays and video delay
      let filterComplex;
      let needsVideoFilter = rtmpDelaySeconds > 0;

      if (this.config.browserAudioPath) {
        // Mix both audio streams with independent volume controls and delays
        const filters = [];

        // Delay RTMP video if RTMP delay is set (only add filter if delay needed)
        if (rtmpDelaySeconds > 0) {
          filters.push(`[0:v]setpts=PTS+${rtmpDelaySeconds}/TB[v0]`);
        }

        // Adjust RTMP audio volume and delay
        if (rtmpDelaySeconds > 0) {
          filters.push(`[0:a]volume=${rtmpVolumeFilter},adelay=${this.config.rtmpDelay}|${this.config.rtmpDelay}[a0]`);
        } else {
          filters.push(`[0:a]volume=${rtmpVolumeFilter}[a0]`);
        }

        // Adjust browser audio volume and delay (already 48kHz from capture)
        if (browserDelaySeconds > 0) {
          filters.push(`[1:a]volume=${browserVolumeFilter},adelay=${this.config.browserDelay}|${this.config.browserDelay}[a1]`);
        } else {
          filters.push(`[1:a]volume=${browserVolumeFilter}[a1]`);
        }

        // Mix both audio streams
        filters.push(`[a0][a1]amix=inputs=2:duration=longest:dropout_transition=2[aout]`);

        filterComplex = filters.join(';');
      } else {
        // Only RTMP with volume adjustment and delay (video + audio together)
        const filters = [];

        // Delay RTMP video if RTMP delay is set
        if (rtmpDelaySeconds > 0) {
          filters.push(`[0:v]setpts=PTS+${rtmpDelaySeconds}/TB[v0]`);
          filters.push(`[0:a]volume=${rtmpVolumeFilter},adelay=${this.config.rtmpDelay}|${this.config.rtmpDelay}[aout]`);
        } else {
          // No video filter needed, just audio volume
          filters.push(`[0:a]volume=${rtmpVolumeFilter}[aout]`);
        }

        filterComplex = filters.join(';');
      }

      // Build output options based on whether video needs re-encoding
      const outputOptions = [];

      // Map video - either from filter or directly
      if (needsVideoFilter) {
        outputOptions.push('-map [v0]');  // Map filtered video
      } else {
        outputOptions.push('-map 0:v');   // Map video directly from input
      }

      // Map audio output
      outputOptions.push('-map [aout]');

      // Add video encoding options
      if (needsVideoFilter) {
        // Re-encode video with specified bitrate when delay is applied
        outputOptions.push(
          '-c:v libx264',                    // Re-encode video (required for setpts)
          '-preset ultrafast',               // Fast encoding
          `-b:v ${this.config.videoBitrate}` // Video bitrate
        );
      } else {
        // Copy video codec when no delay
        outputOptions.push('-c:v copy');
      }

      // Add audio encoding options
      outputOptions.push(
        '-c:a aac',           // Encode audio to AAC
        '-b:a 192k',          // Audio bitrate (increased for better quality)
        '-ar 48000',          // Audio sample rate (match input processing)
        '-ac 2',              // Stereo channels
        '-f flv',             // FLV format for RTMP
        '-flvflags no_duration_filesize'
      );

      this.ffmpegProcess
        .complexFilter(filterComplex)
        .outputOptions(outputOptions)
        .output(this.config.outputRtmpUrl);

      // Event handlers
      this.ffmpegProcess
        .on('start', (commandLine) => {
          console.log('FFmpeg process started:', commandLine);
          this.isRunning = true;
        })
        .on('progress', (progress) => {
          if (progress.timemark) {
            console.log(`Processing: ${progress.timemark} @ ${progress.currentFps || 0} fps`);
          }
        })
        .on('error', (err, stdout, stderr) => {
          console.error('FFmpeg error:', err.message);
          console.error('FFmpeg stderr:', stderr);
          this.isRunning = false;
        })
        .on('end', () => {
          console.log('FFmpeg process ended');
          this.isRunning = false;
        });

      this.ffmpegProcess.run();

      return true;
    } catch (error) {
      console.error('Failed to start mixer:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop() {
    if (this.ffmpegProcess) {
      console.log('Stopping FFmpeg process...');
      return new Promise((resolve) => {
        this.ffmpegProcess.on('end', () => {
          this.isRunning = false;
          this.ffmpegProcess = null;
          resolve();
        });
        this.ffmpegProcess.kill('SIGTERM');
      });
    }
    this.isRunning = false;
  }

  async updateVolumes(rtmpVolume, browserVolume, rtmpDelay, browserDelay) {
    // To update volumes/delays in real-time, we need to restart the process
    // with new settings
    if (this.isRunning) {
      console.log('Updating volumes and delays...');
      this.config.rtmpVolume = rtmpVolume !== undefined ? rtmpVolume : this.config.rtmpVolume;
      this.config.browserVolume = browserVolume !== undefined ? browserVolume : this.config.browserVolume;
      this.config.rtmpDelay = rtmpDelay !== undefined ? rtmpDelay : this.config.rtmpDelay;
      this.config.browserDelay = browserDelay !== undefined ? browserDelay : this.config.browserDelay;
      await this.start(this.config);
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      config: this.config
    };
  }
}

module.exports = RTMPMixer;