import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';

const PORT = process.env.PORT || 3002;
const REDIS_URL = process.env.REDIS_URL;
const redis = REDIS_URL ? new Redis(REDIS_URL) : null;

const ONTOLOGY_KEY = 'jarvis:ontology';

// Helper: Read ontology from Redis
async function readOntology() {
  if (!redis) return { entities: [], relations: [] };
  
  try {
    const data = await redis.get(ONTOLOGY_KEY);
    if (!data) return { entities: [], relations: [] };
    return JSON.parse(data);
  } catch (e) {
    console.error('Read ontology error:', e);
    return { entities: [], relations: [] };
  }
}

// Helper: Write ontology to Redis
async function writeOntology(data) {
  if (!redis) return;
  try {
    await redis.set(ONTOLOGY_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Write ontology error:', e);
  }
}

// Helper: Save entity/relation
async function saveOntologyEntry(entry) {
  const data = await readOntology();
  
  if (entry.op === 'create' && entry.entity) {
    // Add entity
    const existing = data.entities || [];
    existing.push(entry.entity);
    data.entities = existing;
  } else if (entry.op === 'update' && entry.entity) {
    // Update entity
    const entities = data.entities || [];
    const idx = entities.findIndex(e => e.id === entry.entity.id);
    if (idx >= 0) {
      entities[idx] = entry.entity;
    }
    data.entities = entities;
  } else if (entry.op === 'relate') {
    // Add relation
    const relations = data.relations || [];
    relations.push({ from: entry.from, rel: entry.rel, to: entry.to });
    data.relations = relations;
  }
  
  await writeOntology(data);
}

// Initialize with some data if empty
async function initOntology() {
  const data = await readOntology();
  if (data.entities && data.entities.length === 0) {
    // Seed with basic data
    data.entities = [
      { id: 'pers_dawid', type: 'Person', properties: { name: 'Dawid', role: 'owner' }, created: new Date().toISOString(), updated: new Date().toISOString() },
      { id: 'proj_re_leadgen', type: 'Project', properties: { name: 'Real Estate Lead Gen', status: 'planning' }, created: new Date().toISOString(), updated: new Date().toISOString() }
    ];
    data.relations = [
      { from: 'proj_re_leadgen', rel: 'has_owner', to: 'pers_dawid' }
    ];
    await writeOntology(data);
  }
}
initOntology();

const app = express();
app.use(cors());
app.use(express.json());

// ============ ONTOLOGY ROUTES ============

app.get('/ontology', async (req, res) => {
  const data = await readOntology();
  res.json(data);
});

app.post('/ontology/entity', async (req, res) => {
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
  
  await saveOntologyEntry({ op: 'create', entity });
  res.status(201).json(entity);
});

app.put('/ontology/entity/:id', async (req, res) => {
  const { properties } = req.body;
  const data = await readOntology();
  const entities = data.entities || [];
  const idx = entities.findIndex(e => e.id === req.params.id);
  
  if (idx === -1) {
    return res.status(404).json({ error: 'Entity not found' });
  }
  
  const updated = {
    ...entities[idx],
    properties: { ...entities[idx].properties, ...properties },
    updated: new Date().toISOString()
  };
  
  await saveOntologyEntry({ op: 'update', entity: updated });
  res.json(updated);
});

app.post('/ontology/relation', async (req, res) => {
  const { from, rel, to } = req.body;
  if (!from || !rel || !to) {
    return res.status(400).json({ error: 'from, rel, to required' });
  }
  
  await saveOntologyEntry({ op: 'relate', from, rel, to });
  res.status(201).json({ from, rel, to });
});

// ============ CHAT ROUTES (Redis) ============

const CHAT_MESSAGES_KEY = 'jarvis:chat:messages';

app.get('/messages', async (req, res) => {
  if (!redis) return res.json({ messages: [], serverTime: Date.now() });
  
  const lastTimestamp = parseInt(req.query.last || '0');
  const messages = await redis.lrange(CHAT_MESSAGES_KEY, 0, -1);
  const parsed = messages.map(m => JSON.parse(m)).filter(m => m.timestamp > lastTimestamp);
  res.json({ messages: parsed, serverTime: Date.now() });
});

app.post('/messages', async (req, res) => {
  if (!redis) return res.status(500).json({ error: 'Redis not configured' });
  
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
  if (!redis) return res.json({ messages: [], serverTime: Date.now() });
  
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
