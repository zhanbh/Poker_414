const { execFileSync, spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const npmCommand = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm';
let server;
let finished = false;

function stopServer() {
  if (server && !server.killed) server.kill();
}

function waitForHealth() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 30_000;
    const check = () => {
      const request = http.get('http://127.0.0.1:4173/health', (response) => {
        response.resume();
        if (response.statusCode === 200) {
          resolve();
          return;
        }
        retry();
      });
      request.on('error', retry);
    };
    const retry = () => {
      if (Date.now() >= deadline) {
        reject(new Error('等待 E2E 服务健康检查超时'));
        return;
      }
      setTimeout(check, 250);
    };
    check();
  });
}

async function run() {
  const buildArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm run build'] : ['run', 'build'];
  execFileSync(npmCommand, buildArgs, { cwd: root, stdio: 'inherit' });
  server = spawn(process.execPath, ['dist/server/server/src/index.js'], {
    cwd: root,
    env: { ...process.env, INVITE_CODE: 'inner-414', HOST: '127.0.0.1', PORT: '4173' },
    stdio: 'inherit',
  });
  await waitForHealth();

  const cli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js');
  const test = spawn(process.execPath, [cli, 'test'], { cwd: root, stdio: 'inherit' });
  test.on('exit', (code, signal) => {
    if (finished) return;
    finished = true;
    stopServer();
    process.exit(code ?? (signal ? 1 : 0));
  });
}

process.on('SIGINT', () => { stopServer(); process.exit(130); });
process.on('SIGTERM', () => { stopServer(); process.exit(143); });

run().catch((error) => {
  console.error(error);
  stopServer();
  process.exit(1);
});
