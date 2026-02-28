import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(REDIS_URL);

const CHAT_KEY = 'jarvis:chat:messages';
const SESSION_KEY = 'jarvis:chat:session';

let lastChecked = 0;

async function getMessages() {
  const messages = await redis.lrange(CHAT_KEY, 0, -1);
  return messages.map(m => JSON.parse(m));
}

async function sendMessage(text, sender = 'assistant') {
  const msg = {
    sender,
    message: text,
    timestamp: Date.now()
  };
  await redis.rpush(CHAT_KEY, JSON.stringify(msg));
  return msg;
}

async function checkForUserMessages() {
  try {
    const messages = await getMessages();
    const newMessages = messages.filter(m => m.sender === 'guest' && m.timestamp > lastChecked);
    
    if (newMessages.length > 0) {
      console.log(`[APP CHAT] New message: ${newMessages[0].message}`);
      // Forward to me via sessions_send if available
      // For now, just mark as processed
      lastChecked = Date.now();
    }
  } catch (e) {
    console.error('[ERROR]', e.message);
  }
}

console.log('[APP CHAT] Monitoring chat...');
setInterval(checkForUserMessages, 3000);
