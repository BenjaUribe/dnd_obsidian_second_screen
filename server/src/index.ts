import http from 'http';
import path from 'path';
import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { VaultWatcher } from './watcher';
import { AgyRunner, DmStreamEvent } from './agyRunner';

// Cargar variables de entorno desde la raíz del monorepo o directorio actual
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const PORT = Number(process.env.PORT || 3001);
const VAULT_PATH = process.env.VAULT_PATH || 'C:/Users/baua2/Documents/DnD';

const app = express();
app.use(cors());
app.use(express.json());

const vaultWatcher = new VaultWatcher(VAULT_PATH);
vaultWatcher.start();

const agyRunner = new AgyRunner(VAULT_PATH, vaultWatcher.getActiveCampaign());

// Conjunto de clientes SSE activos
const sseClients = new Set<Response>();

/**
 * Endpoint de estado y diagnóstico rápido
 */
app.get('/api/health', (_req: Request, res: Response) => {
  const state = vaultWatcher.getState();
  res.json({
    status: 'ok',
    vaultPath: VAULT_PATH,
    activeCampaign: state.activeCampaign,
    campaigns: state.campaigns,
    lastUpdated: state.lastUpdated,
    stats: {
      characters: state.characters.length,
      sessions: state.sessions.length,
      activeSession: state.activeSession?.title ?? null,
      quests: state.quests.length,
      entitiesIndexed: state.entityList.length,
      sseClients: sseClients.size,
    },
  });
});

/**
 * Carga inicial del estado completo de la bóveda (soporta ?campaign=...)
 */
app.get('/api/vault', (req: Request, res: Response) => {
  const requestedCampaign =
    typeof req.query.campaign === 'string' && req.query.campaign.trim()
      ? req.query.campaign.trim()
      : undefined;

  const prevCampaign = vaultWatcher.getActiveCampaign();
  const state = requestedCampaign
    ? vaultWatcher.setActiveCampaign(requestedCampaign)
    : vaultWatcher.getState();

  agyRunner.setActiveCampaign(state.activeCampaign);

  if (requestedCampaign && state.activeCampaign !== prevCampaign) {
    broadcastVaultState(state, 'campaign-switch', `Campañas/${state.activeCampaign}`);
  }

  res.json(state);
});

/**
 * Fuerza una recarga manual del estado de la bóveda
 */
app.post('/api/refresh', (req: Request, res: Response) => {
  const requestedCampaign =
    (typeof req.body?.campaign === 'string' && req.body.campaign.trim()) ||
    (typeof req.query.campaign === 'string' && req.query.campaign.trim()) ||
    undefined;
  const state = vaultWatcher.refresh('manual-refresh', requestedCampaign);
  agyRunner.setActiveCampaign(state.activeCampaign);
  res.json(state);
});

/**
 * Stream Server-Sent Events (SSE) para sincronización en tiempo real (soporta ?campaign=...)
 */
app.get('/api/events', (req: Request, res: Response) => {
  const requestedCampaign =
    typeof req.query.campaign === 'string' && req.query.campaign.trim()
      ? req.query.campaign.trim()
      : undefined;

  const state = requestedCampaign
    ? vaultWatcher.setActiveCampaign(requestedCampaign)
    : vaultWatcher.getState();
  agyRunner.setActiveCampaign(state.activeCampaign);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Enviar evento inicial de conexión con el estado actual
  const initialPayload = JSON.stringify({
    type: 'initial',
    timestamp: new Date().toISOString(),
    state,
  });
  res.write(`event: vault-update\ndata: ${initialPayload}\n\n`);

  sseClients.add(res);

  // Heartbeat cada 25 segundos para mantener viva la conexión
  const keepAlive = setInterval(() => {
    res.write(`: heartbeat ${Date.now()}\n\n`);
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

const server = http.createServer(app);

// Soporte dual: también exponemos WebSockets en ws://localhost:3001/ws
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcastVaultState(
  state: ReturnType<typeof vaultWatcher.getState>,
  event: string,
  filePath: string
): void {
  const message = JSON.stringify({
    type: 'update',
    event,
    filePath,
    timestamp: new Date().toISOString(),
    state,
  });

  for (const client of sseClients) {
    client.write(`event: vault-update\ndata: ${message}\n\n`);
  }

  for (const wsClient of wss.clients) {
    if (wsClient.readyState === WebSocket.OPEN) {
      wsClient.send(message);
    }
  }
}

function broadcastDmEvent(evt: DmStreamEvent): void {
  const sseData = JSON.stringify(evt);
  for (const client of sseClients) {
    client.write(`event: dm-event\ndata: ${sseData}\n\n`);
  }

  const wsData = JSON.stringify({ type: 'dm-event', payload: evt });
  for (const wsClient of wss.clients) {
    if (wsClient.readyState === WebSocket.OPEN) {
      wsClient.send(wsData);
    }
  }
}

/**
 * Estado actual del runner del Dungeon Master (agy)
 */
app.get('/api/dm/status', (_req: Request, res: Response) => {
  res.json(agyRunner.getStatus());
});

/**
 * Reinicia el hilo de conversación para empezar una nueva sesión con el DM
 */
app.post('/api/dm/reset', (_req: Request, res: Response) => {
  agyRunner.resetSession();
  res.json({ ok: true, ...agyRunner.getStatus() });
});

/**
 * Aborta la ejecución actual del DM si está colgada
 */
app.post('/api/dm/abort', (_req: Request, res: Response) => {
  const aborted = agyRunner.abort();
  res.json({ ok: aborted, ...agyRunner.getStatus() });
});

/**
 * Envía un prompt al Dungeon Master (agy) y transmite la respuesta por SSE y WebSocket
 */
app.post('/api/dm/prompt', (req: Request, res: Response) => {
  const { prompt, newSession, conversationId, campaign } = req.body as {
    prompt?: string;
    newSession?: boolean;
    conversationId?: string;
    campaign?: string;
  };

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    res.status(400).json({ error: 'El campo "prompt" es obligatorio.' });
    return;
  }

  if (agyRunner.getStatus().isProcessing) {
    res.status(409).json({
      error: 'El Dungeon Master ya está procesando una acción. Espera a que termine.',
    });
    return;
  }

  const activeCampaign =
    (typeof campaign === 'string' && campaign.trim()) ||
    vaultWatcher.getActiveCampaign();

  // Ejecutar en segundo plano y emitir eventos en streaming
  agyRunner
    .runPrompt(prompt, { newSession, conversationId, activeCampaign }, (evt) => {
      broadcastDmEvent(evt);
    })
    .catch((err) => {
      broadcastDmEvent({
        type: 'dm-error',
        message: err instanceof Error ? err.message : 'Error al ejecutar agy.',
      });
    });

  res.status(202).json({ ok: true, status: 'started' });
});

wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
  let requestedCampaign: string | undefined;
  try {
    const parsedUrl = new URL(req.url || '', `http://localhost:${PORT}`);
    const campParam = parsedUrl.searchParams.get('campaign');
    if (campParam && campParam.trim()) {
      requestedCampaign = campParam.trim();
    }
  } catch {
    // Ignorar error de URL malformada
  }

  const state = requestedCampaign
    ? vaultWatcher.setActiveCampaign(requestedCampaign)
    : vaultWatcher.getState();
  agyRunner.setActiveCampaign(state.activeCampaign);

  ws.send(
    JSON.stringify({
      type: 'initial',
      timestamp: new Date().toISOString(),
      state,
    })
  );

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw)) as { type?: string; campaign?: string };
      if (
        (msg.type === 'set-campaign' || msg.type === 'select-campaign') &&
        typeof msg.campaign === 'string' &&
        msg.campaign.trim()
      ) {
        const nextState = vaultWatcher.setActiveCampaign(msg.campaign.trim());
        agyRunner.setActiveCampaign(nextState.activeCampaign);
        broadcastVaultState(
          nextState,
          'campaign-switch',
          `Campañas/${nextState.activeCampaign}`
        );
      }
    } catch {
      // Ignorar mensajes no JSON
    }
  });
});

// Emitir actualizaciones tanto por SSE como por WebSocket cuando Chokidar detecte cambios
vaultWatcher.onUpdate((state, event, filePath) => {
  agyRunner.setActiveCampaign(state.activeCampaign);
  broadcastVaultState(state, event, filePath);
});

server.listen(PORT, () => {
  const state = vaultWatcher.getState();
  console.log('====================================================');
  console.log(`🐉 D&D 5e Live Vault HUD - Backend activo`);
  console.log(`📡 HTTP API:   http://localhost:${PORT}/api/vault`);
  console.log(`⚡ SSE Stream: http://localhost:${PORT}/api/events`);
  console.log(`🔌 WebSocket:  ws://localhost:${PORT}/ws`);
  console.log(`📂 Bóveda:     ${VAULT_PATH}`);
  console.log(
    `🏕️ Campaña:    ${state.activeCampaign || '(ninguna)'} (${state.campaigns.length} disponibles)`
  );
  console.log(
    `📊 Indexados:  ${state.characters.length} PJs | ${state.sessions.length} Sesiones | ${state.quests.length} Misiones | ${state.entityList.length} Entidades`
  );
  console.log('====================================================');
});

