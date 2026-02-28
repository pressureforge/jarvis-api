const http = require('http');

let lastTimestamp = Date.now();

function checkAndRespond() {
  http.get('http://localhost:3002/messages?last=0', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', async () => {
      try {
        const json = JSON.parse(data);
        const newMsgs = json.messages.filter(m => m.sender === 'guest' && m.timestamp > lastTimestamp);
        
        if (newMsgs.length > 0) {
          console.log('[NEW]', newMsgs.map(m => m.message).join(', '));
          lastTimestamp = json.serverTime;
          
          // Just log for now - I'll respond manually for now
          // Could integrate with me via sessions_send
        } else {
          lastTimestamp = json.serverTime;
        }
      } catch(e) { console.error(e.message); }
    });
  }).on('error', () => {});
}

console.log('[AUTO-RESPOND] Starting...');
setInterval(checkAndRespond, 2000);
