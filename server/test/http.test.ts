import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createHttpApp } from '../src/http';
import { RoomService } from '../src/room-service';

describe('HTTP 健康检查', () => {
  it('返回进程和单房间占用状态，不泄露邀请码和手牌', async () => {
    const room = new RoomService({ inviteCode: 'secret', now: () => 0, random: () => 0.1 });
    const response = await request(createHttpApp(room)).get('/health').expect(200);

    expect(response.body).toEqual({ ok: true, roomOccupied: false });
    expect(JSON.stringify(response.body)).not.toContain('secret');
    expect(JSON.stringify(response.body)).not.toContain('hand');
  });
});
