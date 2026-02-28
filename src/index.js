import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3002;

const ONTOLOGY_FILE = process.env.ONTOLOGY_FILE || '/data/workspace/memory/ontology/graph.jsonl';
const MESSAGES_FILE = process.env.MESSAGES_FILE || path.join(__dirname, '../data/messages.json');

// Ensure data directory
const dataDir = path.dirname(ONTOLOGY_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize files
if (!fs.existsSync(ONTOLOGY_FILE)) {
  fs.writeFileSync(ONTOLOGY_FILE, '');
}
if (!fs.existsSync(MESSAGES_FILE)) {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify([]));
}

// Helper: Read all ontology entries
function readOntology() {
  try {
    const content = fs.readFileSync(ONTOLOGY_FILE, 'utf8');
    if (!content.trim()) return [];
    return content.trim().split('\n').map(line => JSON.parse(line));
  } catch (e) {
    return [];
  }
}

// Helper: Write ontology entry (append)
function writeOntologyEntry(entry) {
  fs.appendFileSync(ONTOLOGY_FILE, JSON.stringify(entry) + '\n');
}

// Helper: Read messages
function readMessages() {
  try {
    return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

// Helper: Write message
function writeMessage(msg) {
  const messages = readMessages();
  messages.push(msg);
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
}

const app = express();
app.use(cors());
app.use(express.json());

// ============ ONTOLOGY ROUTES ============

// GET /ontology - Get all entities and relations
app.get('/ontology', (req, res) => {
  const entries = readOntology();
  const entities = entries.filter(e => e.entity).map(e => e.entity);
  const relations = entries.filter(e => e.from && e.rel && e.to);
  res.json({ entities, relations });
});

// POST /ontology/entity - Create entity
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

  const entry = {
    op: 'create',
    entity,
    timestamp: new Date().toISOString()
  };

  writeOntologyEntry(entry);
  res.status(201).json(entity);
});

// GET /ontology/entity/:id - Get entity by ID
app.get('/ontology/entity/:id', (req, res) => {
  const entries = readOntology();
  const entity = entries.find(e => e.entity?.id === req.params.id);
  
  if (!entity) {
    return res.status(404).json({ error: 'Entity not found' });
  }
  
  res.json(entity.entity);
});

// PUT /ontology/entity/:id - Update entity
app.put('/ontology/entity/:id', (req, res) => {
  const { properties } = req.body;
  const entries = readOntology();
  const idx = entries.findIndex(e => e.entity?.id === req.params.id);
  
  if (idx === -1) {
    return res.status(404).json({ error: 'Entity not found' });
  }

  const updated = {
    ...entries[idx].entity,
    properties: { ...entries[idx].entity.properties, ...properties },
    updated: new Date().toISOString()
  };

  const entry = {
    op: 'update',
    entity: updated,
    timestamp: new Date().toISOString()
  };

  writeOntologyEntry(entry);
  res.json(updated);
});

// DELETE /ontology/entity/:id - Delete entity
app.delete('/ontology/entity/:id', (req, res) => {
  const entries = readOntology();
  const exists = entries.find(e => e.entity?.id === req.params.id);
  
  if (!exists) {
    return res.status(404).json({ error: 'Entity not found' });
  }

  const entry = {
    op: 'delete',
    entityId: req.params.id,
    timestamp: new Date().toISOString()
  };

  writeOntologyEntry(entry);
  res.json({ success: true });
});

// POST /ontology/relation - Create relation
app.post('/ontology/relation', (req, res) => {
  const { from, rel, to, properties } = req.body;
  
  if (!from || !rel || !to) {
    return res.status(400).json({ error: 'from, rel, and to required' });
  }

  const entry = {
    op: 'relate',
    from,
    rel,
    to,
    properties: properties || {},
    timestamp: new Date().toISOString()
  };

  writeOntologyEntry(entry);
  res.status(201).json(entry);
});

// GET /ontology/related/:id - Get related entities
app.get('/ontology/related/:id', (req, res) => {
  const { rel } = req.query;
  const entries = readOntology();
  
  let relations = entries.filter(e => 
    e.from === req.params.id || e.to === req.params.id
  );

  if (rel) {
    relations = relations.filter(e => e.rel === rel);
  }

  res.json(relations);
});

// POST /ontology/query - Query entities
app.post('/ontology/query', (req, res) => {
  const { type, where } = req.body;
  const entries = readOntology();
  
  let entities = entries.filter(e => e.entity);
  
  if (type) {
    entities = entities.filter(e => e.entity.type === type);
  }
  
  if (where) {
    entities = entities.filter(e => {
      return Object.entries(where).every(([key, value]) => 
        e.entity.properties[key] === value
      );
    });
  }
  
  res.json(entities.map(e => e.entity));
});

// ============ CHAT ROUTES ============

// GET /messages - Get chat messages
app.get('/messages', (req, res) => {
  const messages = readMessages();
  res.json({ messages, serverTime: Date.now() });
});

// POST /messages - Send message
app.post('/messages', (req, res) => {
  const { message, sender } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'message required' });
  }

  const msg = {
    sender: sender || 'guest',
    message,
    timestamp: Date.now()
  };

  writeMessage(msg);
  res.status(201).json(msg);
});

// GET /messages/poll - Poll for new messages
app.get('/messages/poll', (req, res) => {
  const lastTimestamp = parseInt(req.query.last || '0');
  const messages = readMessages();
  const newMessages = messages.filter(m => m.timestamp > lastTimestamp);
  res.json({ messages: newMessages, serverTime: Date.now() });
});

// ============ HEALTH ============

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Jarvis API running on port ${PORT}`);
});
