import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(REDIS_URL);

const CHAT_MESSAGES_KEY = 'jarvis:chat:messages';
const OWLWARE = process.env.OWLWARE || 'http://localhost:8080';

let lastChecked = 0;

async function sendMessage(text) {
  const msg = {
    sender: 'assistant',
    message: text,
    timestamp: Date.now()
  };
  await redis.rpush(CHAT_MESSAGES_KEY, JSON.stringify(msg));
  console.log(`[JARVIS] ${text}`);
}

async function getMessages() {
  const messages = await redis.lrange(CHAT_MESSAGES_KEY, 0, -1);
  return messages.map(m => JSON.parse(m));
}

async function processMessage(msg) {
  const text = msg.message.toLowerCase();
  
  // Simple responses based on keywords
  let response = "I received your message.";
  
  if (text.includes('hello') || text.includes('hi')) {
    response = "Hey! 👋 I'm here. What would you like to work on?";
  } else if (text.includes('how are')) {
    response = "I'm doing great! Ready to help with whatever you need.";
  } else if (text.includes('create') && text.includes('project')) {
    response = "Let's create a project. What should I name it and what's the goal?";
  } else if (text.includes('task')) {
    response = "I'll add a task. What's the task and who's responsible?";
  } else if (text.includes('remember')) {
    response = "Got it. I'll save that to our ontology.";
  } else if (text.includes('?')) {
    response = "Interesting question! Let me think about that.";
  } else {
    response = `I got: "${msg.message}". What would you like me to do with this?`;
  }
  
  return response;
}

async function checkAndRespond() {
  try {
    const messages = await getMessages();
    const newMessages = messages.filter(m => m.sender === 'guest' && m.timestamp > lastChecked);
    
    if (newMessages.length > 0) {
      console.log(`[NEW] ${newMessages.length} message(s)`);
      
      for (const msg of newMessages) {
        const response = await processMessage(msg);
        await sendMessage(response);
      }
      
      lastChecked = Date.now();
    }
  } catch (e) {
    console.error('[ERROR]', e.message);
  }
}

// Start polling
console.log('[POLLER] Starting chat poller...');
setInterval(checkAndRespond, 3000);
