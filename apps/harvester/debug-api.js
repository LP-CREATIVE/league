const https = require('https');
const fs = require('fs');
const agent = new https.Agent({ rejectUnauthorized: false });

async function debug() {
  try {
    const res = await fetch('https://127.0.0.1:2999/liveclientdata/allgamedata', {
      agent: agent
    });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
    fs.writeFileSync('game-data.json', JSON.stringify(data, null, 2));
    console.log('\nData saved to game-data.json');
  } catch (err) {
    console.log('Error:', err.message);
  }
}
debug();
