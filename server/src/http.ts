import express, { Express } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { RoomService } from './room-service';

export function createHttpApp(room: RoomService, clientDist?: string): Express {
  const app = express();
  app.use(express.json());
  app.get('/health', (_request, response) => {
    response.json({ ok: true, roomOccupied: room.hasRoom() });
  });

  if (clientDist && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    const indexPath = path.join(clientDist, 'index.html');
    if (fs.existsSync(indexPath)) app.get(/.*/, (_request, response) => response.sendFile(indexPath));
  }
  return app;
}
