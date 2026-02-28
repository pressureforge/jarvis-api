const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(REDIS_URL);

const CHAT_KEY = 'jarvis:chat:messages';
let lastTimestamp = 0;

async function getMessages() {
  const messages = await redis.lrange(CHAT_KEY, 0, -1);
  return messages.map(m => JSON.parse(m));
}

async function notifyMe(message) {
  const { execSync } = require('child_process');
  const cmd = `openclaw agent -m "New message on jarvis-tool.xyz: ${message}"`;
  try {
    execSync(cmd, { timeout: 30000 });
    console.log('[NOTIFIED] Jarvis');
  } catch(e) {
    console.log('[NOTIFY ERROR]', e.message);
  }
}

async function check() {
  try {
    const messages = await getMessages();
    const newMsgs = messages.filter(m => m.sender === 'guest' && m.timestamp > lastTimestamp);
    
    if (newMsgs.length > 0) {
      console.log('[NEW]', newMsgs[0].message);
      await notifyMe(newMsgs[0].message);
      lastTimestamp = messages[messages.length - 1].timestamp;
    } else if (messages.length > 0) {
      lastTimestamp = messages[messages.length - 1].timestamp;
    }
  } catch(e) {
    console.error('[ERROR]', e.message);
  }
}

console.log('[DIRECT-CONNECT] Starting...');
setInterval(check, 5000);
