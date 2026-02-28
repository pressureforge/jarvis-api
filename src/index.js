import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';

const __dirname = '/data/workspace';
const PORT = process.env.PORT || 3002;

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const ONTOLOGY_FILE = process.env.ONTOLOGY_FILE || '/data/workspace/memory/ontology/graph.jsonl';

const redis = new Redis(REDIS_URL);

// Helper: Read ontology
function readOntology() {
  try {
    const fs = require('fs');
    if (!fs.existsSync(ONTOLOGY_FILE)) return [];
    const content = fs.readFileSync(ONTOLOGY_FILE, 'utf8');
    if (!content.trim()) return [];
    return content.trim().split('\n').map(line => JSON.parse(line));
  } catch (e) {
    return [];
  }
}

// Helper: Write ontology entry
function writeOntologyEntry(entry) {
  const fs = require('fs');
  const dir = require('path').dirname(ONTOLOGY_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(ONTOLOGY_FILE)) fs.writeFileSync(ONTOLOGY_FILE, '');
  fs.appendFileSync(ONTOLOGY_FILE, JSON.stringify(entry) + '\n');
}

const app = express();
app.use(cors());
app.use(express.json());

// ============ ONTOLOGY ROUTES ============

app.get('/ontology', (req, res) => {
  const entries = readOntology();
  const entities = entries.filter(e => e.entity).map(e => e.entity);
  const relations = entries.filter(e => e.from && e.rel && e.to);
  res.json({ entities, relations });
});

app.post('/ontology/entity', (req, res) => {
  const { type, properties } = req.body;
  if (!type || !properties) {
    return res.status(400).json({ error: 'type and properties required' });
  }
  const entity = {
    id: `${type.toLowerCase()}_${uuidv4().slice(0, 8)}`,
    type,
    properties,
    created: new Date().toISOString(),
    updated: new Date().toISOString()
  };
  writeOntologyEntry({ op: 'create', entity });
  res.status(201).json(entity);
});

app.put('/ontology/entity/:id', (req, res) => {
  const { properties } = req.body;
  const entries = readOntology();
  const idx = entries.findIndex(e => e.entity?.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Entity not found' });
  const updated = { ...entries[idx].entity, properties: { ...entries[idx].entity.properties, ...properties }, updated: new Date().toISOString() };
  writeOntologyEntry({ op: 'update', entity: updated });
  res.json(updated);
});

app.post('/ontology/relation', (req, res) => {
  const { from, rel, to } = req.body;
  if (!from || !rel || !to) return res.status(400).json({ error: 'from, rel, to required' });
  writeOntologyEntry({ op: 'relate', from, rel, to });
  res.status(201).json({ from, rel, to });
});

// ============ CHAT ROUTES (Redis) ============

const CHAT_MESSAGES_KEY = 'jarvis:chat:messages';

app.get('/messages', async (req, res) => {
  const lastTimestamp = parseInt(req.query.last || '0');
  const messages = await redis.lrange(CHAT_MESSAGES_KEY, 0, -1);
  const parsed = messages.map(m => JSON.parse(m)).filter(m => m.timestamp > lastTimestamp);
  res.json({ messages: parsed, serverTime: Date.now() });
});

app.post('/messages', async (req, res) => {
  const { message, sender } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  
  const msg = {
    sender: sender || 'guest',
    message,
    timestamp: Date.now()
  };
  
  await redis.rpush(CHAT_MESSAGES_KEY, JSON.stringify(msg));
  res.status(201).json(msg);
});

app.get('/messages/poll', async (req, res) => {
  const lastTimestamp = parseInt(req.query.last || '0');
  const messages = await redis.lrange(CHAT_MESSAGES_KEY, 0, -1);
  const parsed = messages.map(m => JSON.parse(m)).filter(m => m.timestamp > lastTimestamp);
  res.json({ messages: parsed, serverTime: Date.now() });
});

// ============ HEALTH ============

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Jarvis API running on port ${PORT}`);
});
