import path from 'node:path';

export interface ServerConfig {
  readonly inviteCode: string;
  readonly host: string;
  readonly port: number;
  readonly clientDist: string;
  readonly presenceScanMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const inviteCode = env.INVITE_CODE?.trim();
  if (!inviteCode) throw new Error('缺少 INVITE_CODE 配置，拒绝以公开模式启动');

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT 配置无效');

  return {
    inviteCode,
    host: env.HOST ?? '0.0.0.0',
    port,
    clientDist: env.CLIENT_DIST ?? path.resolve(process.cwd(), 'dist/client'),
    presenceScanMs: Number(env.PRESENCE_SCAN_MS ?? 5_000),
  };
}
