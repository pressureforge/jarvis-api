import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(REDIS_URL);

const CHAT_KEY = 'jarvis:chat:messages';

let lastChecked = 0;

async function getMessages() {
  const messages = await redis.lrange(CHAT_KEY, 0, -1);
  return messages.map(m => JSON.parse(m));
}

async function sendReply(text) {
  const msg = {
    sender: 'assistant',
    message: text,
    timestamp: Date.now()
  };
  await redis.rpush(CHAT_KEY, JSON.stringify(msg));
}

async function checkForUserMessages() {
  try {
    const messages = await getMessages();
    const newMessages = messages.filter(m => m.sender === 'guest' && m.timestamp > lastChecked);
    
    if (newMessages.length > 0) {
      console.log(`[APP CHAT] New: ${newMessages[0].message}`);
      lastChecked = Date.now();
    }
  } catch (e) {
    console.error('[ERROR]', e.message);
  }
}

console.log('[APP CHAT] Monitoring chat for new messages...');
setInterval(checkForUserMessages, 2000);

// Also expose a simple respond function via HTTP
const http = require('http');
const server = http.createServer((req, res) => {
  if (req.url === '/respond' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      const { message } = JSON.parse(body);
      await sendReply(message);
      res.end('OK');
    });
  }
});

server.listen(3003, () => {
  console.log('[RESPONDER] Listening on port 3003');
});
