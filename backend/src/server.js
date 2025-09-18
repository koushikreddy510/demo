/* eslint-disable */
import express from "express";
import http from "http";
import cors from "cors";
import morgan from "morgan";
import { WebSocketServer } from "ws";
import { MongoClient } from "mongodb";
import Redis from "ioredis";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();
app.use(express.json());
app.use(morgan("dev"));

const allowedOrigin = process.env.CORS_ORIGIN || "*";
app.use(cors({ origin: allowedOrigin }));

// In-memory store (fallback). With MongoDB + Redis enabled, we persist and cross-broadcast.
const channelToClients = new Map(); // channel -> Set(ws)
const channelHistory = new Map(); // channel -> Array<{ ts, message }>

const MAX_HISTORY = Number(process.env.MAX_HISTORY || 50);
const PORT = Number(process.env.PORT || 3000);

function ensureChannel(channel) {
  if (!channelToClients.has(channel)) channelToClients.set(channel, new Set());
  if (!channelHistory.has(channel)) channelHistory.set(channel, []);
}

function appendHistory(channel, payload) {
  const arr = channelHistory.get(channel) || [];
  arr.push({ ts: Date.now(), message: payload });
  while (arr.length > MAX_HISTORY) arr.shift();
  channelHistory.set(channel, arr);
}

// Optional integrations
const MONGODB_URI = process.env.MONGODB_URI;
const REDIS_URL = process.env.REDIS_URL;

let mongoClient = null;
let messagesCollection = null;
let redisPub = null;
let redisSub = null;

async function initMongo() {
  console.log("Mongo URI ---->>>>", MONGODB_URI);
  if (!MONGODB_URI) return;
  mongoClient = new MongoClient(MONGODB_URI, { ignoreUndefined: true });
  await mongoClient.connect();
  const dbName = process.env.MONGODB_DB || "plivo_demo";
  const collName = process.env.MONGODB_COLLECTION || "messages";
  const db = mongoClient.db(dbName);
  messagesCollection = db.collection(collName);
  await messagesCollection.createIndex({ channel: 1, ts: -1 });
  console.log("MongoDB connected");
}

// Unique instance id to avoid double-delivery when using Redis
const INSTANCE_ID = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

async function initRedis() {
  if (!REDIS_URL) return;
  // Simple ioredis connections using URL (supports redis:// and rediss://)
  redisPub = new Redis(REDIS_URL);
  redisSub = new Redis(REDIS_URL);

  // Wait until both are ready
  await new Promise((resolve) => {
    let ready = 0;
    const check = () => {
      if (ready === 2) resolve();
    };
    redisPub.once("ready", () => {
      ready++;
      check();
    });
    redisSub.once("ready", () => {
      ready++;
      check();
    });
  });

  console.log("Redis connected");
  redisPub.on("error", (e) => console.error("redisPub error", e.message));
  redisSub.on("error", (e) => console.error("redisSub error", e.message));

  // Cross-instance message handler (set after ready)
  redisSub.on("message", (channelName, message) => {
    console.log("redis subscribe messges ---->>>>", channelName, nessage);
    try {
      const event = JSON.parse(message);
      console.log("message on redis sub ---->>>>", event);
      if (event.sourceId && event.sourceId === INSTANCE_ID) return; // ignore self-originated events
      const ch = channelName.replace(/^ch:/, "");
      const clients = channelToClients.get(ch) || new Set();
      for (const ws of clients) {
        if (ws.readyState === 1) {
          try {
            ws.send(JSON.stringify(event));
          } catch (e) {}
        }
      }
    } catch (e) {}
  });
}

// REST endpoints
app.get("/healthz", (req, res) => res.status(200).send("ok"));

app.post("/publish/:channel", async (req, res) => {
  const channel = req.params.channel;
  const payload = req.body;
  console.log("channel, payload ---->>>", channel, payload);
  ensureChannel(channel);
  const event = { type: "message", channel, payload, sourceId: INSTANCE_ID };
  const now = Date.now();

  // Persist to MongoDB if available
  try {
    if (messagesCollection) {
      await messagesCollection.insertOne({
        channel,
        ts: now,
        message: payload,
      });
    } else {
      appendHistory(channel, payload);
    }
  } catch (e) {}

  // Fan-out locally
  let delivered = 0;
  try {
    const clients = channelToClients.get(channel) || new Set();
    console.log("clients connected ---->>>", clients.size);
    for (const ws of clients) {
      if (ws.readyState === 1) {
        try {
          console.log("this is the event being sent -----", event);
          ws.send(JSON.stringify(event));
          delivered++;
        } catch (e) {}
      }
    }
  } catch (e) {}

  // Cross-instance via Redis pub/sub
  try {
    if (redisPub) {
      console.log("try to publish ---->>>>");
      await redisPub.publish(`ch:${channel}`, JSON.stringify(event));
    }
  } catch (e) {}

  return res.json({ status: "ok", channel, delivered });
});

app.get("/history/:channel", async (req, res) => {
  const channel = req.params.channel;
  ensureChannel(channel);
  const last = Number(req.query.last || MAX_HISTORY);
  if (messagesCollection) {
    try {
      const docs = await messagesCollection
        .find({ channel })
        .sort({ ts: -1 })
        .limit(last)
        .toArray();
      // Return ascending order
      const items = docs
        .reverse()
        .map((d) => ({ ts: d.ts, message: d.message }));
      console.log("items on page connect ----", items);
      return res.json({ channel, items });
    } catch (e) {}
  }
  const items = (channelHistory.get(channel) || []).slice(-last);
  return res.json({ channel, items });
});

// Simple metrics
app.get("/metrics", (req, res) => {
  const channels = Array.from(channelToClients.keys());
  const totalClients = channels.reduce(
    (acc, ch) => acc + channelToClients.get(ch).size,
    0
  );
  res.json({
    uptimeSec: Math.floor(process.uptime()),
    channels: channels.map((ch) => ({
      ch,
      clients: channelToClients.get(ch).size,
    })),
    totalClients,
  });
});

const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: "/ws" });

// Heartbeat for robust connections
function heartbeat() {
  this.isAlive = true;
}

wss.on("connection", (ws, req) => {
  ws.isAlive = true;
  ws.on("pong", heartbeat);

  // subscribe message: { type: 'subscribe', channels: ['room1', 'room2'] }
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === "subscribe" && Array.isArray(msg.channels)) {
        ws.channels = msg.channels;
        for (const ch of msg.channels) {
          ensureChannel(ch);
          channelToClients.get(ch).add(ws);
          // Subscribe Redis to this channel to receive cross-instance events
          try {
            if (redisSub) {
              // Avoid re-subscribing if already
              const subKey = `ch:${ch}`;
              if (!ws._redisSubs) ws._redisSubs = new Set();
              if (!ws._redisSubs.has(subKey)) {
                ws._redisSubs.add(subKey);
                redisSub.subscribe(subKey);
              }
            }
          } catch (e) {}
        }
        ws.send(JSON.stringify({ type: "subscribed", channels: msg.channels }));
      } else if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
      }
    } catch (e) {}
  });

  ws.on("close", () => {
    if (Array.isArray(ws.channels)) {
      for (const ch of ws.channels) {
        const set = channelToClients.get(ch);
        if (set) set.delete(ws);
      }
    }
  });
});

// Ping clients periodically to detect dead connections
const interval = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    try {
      ws.ping();
    } catch (e) {}
  }
}, 30000);

wss.on("close", () => clearInterval(interval));

async function start() {
  try {
    await initMongo();
    await initRedis();
  } catch (e) {
    console.error("Init error", e);
  }
  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

start();
