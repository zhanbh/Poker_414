// pm2 配置文件
// 使用方式:
//   1. 复制 .env.example 为 .env 并修改 INVITE_CODE
//   2. npx pm2 start ecosystem.config.cjs   (或 npm run pm2:start)
//
// 也可直接在启动前设置环境变量覆盖默认值:
//   INVITE_CODE=mycode npx pm2 start ecosystem.config.cjs

// 从 .env 文件加载环境变量（如果存在）
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
const dotenv = fs.existsSync(envPath)
  ? Object.fromEntries(
      fs.readFileSync(envPath, 'utf8')
        .split('\n')
        .filter((l) => l.trim() && !l.trim().startsWith('#'))
        .map((l) => {
          const idx = l.indexOf('=');
          return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
        })
    )
  : {};

module.exports = {
  apps: [
    {
      name: '414-server',
      script: 'dist/server/server/src/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: dotenv.PORT || process.env.PORT || 3000,
        HOST: dotenv.HOST || process.env.HOST || '0.0.0.0',
        INVITE_CODE: dotenv.INVITE_CODE || process.env.INVITE_CODE || 'change-me',
        CLIENT_DIST: dotenv.CLIENT_DIST || process.env.CLIENT_DIST || 'dist/client',
        PRESENCE_SCAN_MS: dotenv.PRESENCE_SCAN_MS || process.env.PRESENCE_SCAN_MS || '5000',
      },
      max_memory_restart: '512M',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
