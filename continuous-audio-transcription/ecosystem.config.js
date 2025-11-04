/**
 * PM2 Ecosystem Configuration
 * pm2によるプロセス管理設定
 */

module.exports = {
  apps: [
    {
      name: 'continuous-transcription',
      script: 'dist/index.js',
      cwd: __dirname,

      // Process management
      instances: 1, // Single process (no cluster mode)
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '2048M', // Restart if memory exceeds 2GB

      // Logging
      error_file: '~/transcriptions/logs/error.log',
      out_file: '~/transcriptions/logs/out.log',
      log_file: '~/transcriptions/logs/combined.log',
      time: true, // Add timestamps to logs
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Environment variables
      env: {
        NODE_ENV: 'production',
        TRANSCRIPTION_BASE_DIR: '~/transcriptions',
      },

      env_development: {
        NODE_ENV: 'development',
        TRANSCRIPTION_BASE_DIR: './test-transcriptions',
      },

      // Crash handling
      min_uptime: '10s', // Minimum uptime before considering restart successful
      max_restarts: 10, // Maximum consecutive restarts within restart_delay
      restart_delay: 4000, // Delay between restarts (ms)

      // Kill timeout
      kill_timeout: 3000, // Time to wait before force kill (ms)

      // Graceful shutdown
      listen_timeout: 3000, // Time to wait for app to listen
      shutdown_with_message: false,
    },
  ],
};
