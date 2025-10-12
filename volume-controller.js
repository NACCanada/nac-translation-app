const ffmpeg = require('fluent-ffmpeg');
const { exec } = require('child_process');

class VolumeController {
  constructor() {
    this.ffmpegProcess = null;
    this.isRunning = false;
    this.config = {
      outputRtmpUrl: '',
      rtmpVolume: 100,
      browserVolume: 100
    };
  }

  async start(config) {
    if (this.isRunning) {
      console.log('Volume controller already running, stopping first...');
      await this.stop();
    }

    this.config = { ...this.config, ...config };

    try {
      // Convert volume percentage to FFmpeg filter value
      const rtmpVolumeFilter = this.config.rtmpVolume / 100;
      const browserVolumeFilter = this.config.browserVolume / 100;

      console.log('Starting volume controller...');
      console.log('RTMP Volume:', this.config.rtmpVolume);
      console.log('Browser Volume:', this.config.browserVolume);
      console.log('Output RTMP:', this.config.outputRtmpUrl);

      this.ffmpegProcess = ffmpeg();

      // Input from stdin pipe (comes from main mixer)
      this.ffmpegProcess.input('pipe:0')
        .inputFormat('flv')
        .inputOptions([
          '-re',  // Read input at native frame rate
          '-thread_queue_size', '1024'
        ]);

      // Apply volume control to both audio streams
      // We expect two audio tracks: [0:a:0] = RTMP audio, [0:a:1] = browser audio
      const filterComplex = [
        `[0:a:0]volume=${rtmpVolumeFilter}[a0]`,
        `[0:a:1]volume=${browserVolumeFilter}[a1]`,
        `[a0][a1]amix=inputs=2:duration=longest:dropout_transition=2[aout]`
      ].join(';');

      this.ffmpegProcess
        .complexFilter(filterComplex)
        .outputOptions([
          '-map', '0:v',      // Copy video stream
          '-map', '[aout]',   // Map mixed audio output
          '-c:v', 'copy',     // Copy video codec (no re-encoding)
          '-c:a', 'aac',      // Encode audio to AAC
          '-b:a', '192k',     // Audio bitrate
          '-ar', '48000',     // Audio sample rate
          '-ac', '2',         // Stereo
          '-f', 'flv',        // FLV format for RTMP
          '-flvflags', 'no_duration_filesize',
          '-max_muxing_queue_size', '1024'  // Prevent queue overflow
        ])
        .output(this.config.outputRtmpUrl);

      // Event handlers
      this.ffmpegProcess
        .on('start', (commandLine) => {
          console.log('Volume controller started:', commandLine);
          this.isRunning = true;
        })
        .on('progress', (progress) => {
          if (progress.timemark) {
            console.log(`Volume controller: ${progress.timemark}`);
          }
        })
        .on('error', (err, stdout, stderr) => {
          console.error('Volume controller error:', err.message);
          if (stderr) {
            console.error('Volume controller stderr:', stderr);
          }
          this.isRunning = false;
        })
        .on('end', () => {
          console.log('Volume controller ended');
          this.isRunning = false;
        });

      this.ffmpegProcess.run();

      return true;
    } catch (error) {
      console.error('Failed to start volume controller:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop() {
    if (this.ffmpegProcess) {
      console.log('Stopping volume controller...');

      return new Promise((resolve) => {
        let resolved = false;

        const cleanupAndResolve = () => {
          if (!resolved) {
            resolved = true;
            this.isRunning = false;
            this.ffmpegProcess = null;

            // On Windows, kill all ffmpeg.exe processes as a last resort
            if (process.platform === 'win32') {
              console.log('Ensuring volume controller FFmpeg is terminated on Windows...');
              exec('taskkill /F /IM ffmpeg.exe /T', (err) => {
                if (err && !err.message.includes('not found')) {
                  console.error('Error running taskkill:', err.message);
                }
                resolve();
              });
            } else {
              resolve();
            }
          }
        };

        // Set timeout for cleanup
        const timeout = setTimeout(() => {
          console.log('Volume controller did not stop within timeout, forcing cleanup...');
          cleanupAndResolve();
        }, 2000); // 2 second timeout

        // Set up event listeners
        this.ffmpegProcess.on('end', () => {
          clearTimeout(timeout);
          console.log('Volume controller ended gracefully');
          cleanupAndResolve();
        });

        this.ffmpegProcess.on('error', (err) => {
          clearTimeout(timeout);
          console.log('Volume controller error during stop:', err.message);
          cleanupAndResolve();
        });

        // Try to kill the process
        try {
          // On Windows, use taskkill immediately for reliability
          if (process.platform === 'win32') {
            console.log('Using taskkill to stop volume controller on Windows...');
            exec('taskkill /F /IM ffmpeg.exe /T', (err) => {
              if (err && !err.message.includes('not found')) {
                console.error('taskkill error:', err.message);
              }
              // Give it a moment then cleanup
              setTimeout(() => {
                clearTimeout(timeout);
                cleanupAndResolve();
              }, 500);
            });
          } else {
            // On Unix, use SIGTERM for graceful shutdown
            console.log('Sending SIGTERM to volume controller...');
            this.ffmpegProcess.kill('SIGTERM');
          }
        } catch (err) {
          clearTimeout(timeout);
          console.error('Error killing volume controller:', err.message);
          cleanupAndResolve();
        }
      });
    }

    this.isRunning = false;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      config: this.config
    };
  }

  getProcess() {
    return this.ffmpegProcess;
  }
}

module.exports = VolumeController;
