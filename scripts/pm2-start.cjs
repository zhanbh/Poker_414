#!/usr/bin/env node
/**
 * 一键启动脚本：构建 + pm2 启动
 *
 * 用法:
 *   node scripts/pm2-start.cjs              # 构建 + 启动
 *   node scripts/pm2-start.cjs --no-build   # 跳过构建，直接启动
 *   node scripts/pm2-start.cjs --stop       # 停止
 *   node scripts/pm2-start.cjs --restart    # 重启
 *   node scripts/pm2-start.cjs --status     # 查看状态
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: root, ...opts });
}

function pm2(args) {
  const result = spawnSync('npx', ['pm2', ...args], {
    stdio: 'inherit',
    cwd: root,
    shell: true,
  });
  if (result.status !== 0) {
    console.error(`pm2 ${args.join(' ')} 失败 (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
}

function ensureLogsDir() {
  const logsDir = path.join(root, 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
}

function checkBuilt() {
  const serverEntry = path.join(root, 'dist', 'server', 'server', 'src', 'index.js');
  const clientIndex = path.join(root, 'dist', 'client', 'index.html');
  if (!fs.existsSync(serverEntry) || !fs.existsSync(clientIndex)) {
    console.error('未找到构建产物，请先运行构建或去掉 --no-build 参数。');
    process.exit(1);
  }
}

const action = args[0] || '--start';
const skipBuild = args.includes('--no-build');

switch (action) {
  case '--stop':
    pm2(['stop', 'ecosystem.config.cjs']);
    break;

  case '--restart':
    pm2(['restart', 'ecosystem.config.cjs']);
    break;

  case '--status':
    pm2(['status', 'ecosystem.config.cjs']);
    break;

  case '--delete':
    pm2(['delete', 'ecosystem.config.cjs']);
    break;

  case '--start':
  default:
    ensureLogsDir();

    if (!skipBuild) {
      console.log('=== 构建项目 ===');
      run('npm run build');
    } else {
      checkBuilt();
    }

    console.log('=== pm2 启动 ===');
    pm2(['start', 'ecosystem.config.cjs']);
    pm2(['status']);
    console.log('\n服务已启动:');
    console.log('  应用: http://localhost:3000');
    console.log('  健康检查: http://localhost:3000/health');
    console.log('  查看状态: node scripts/pm2-start.cjs --status');
    console.log('  查看日志: npx pm2 logs 414-server');
    console.log('  停止服务: node scripts/pm2-start.cjs --stop');
    break;
}
