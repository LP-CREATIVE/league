import fetch from 'node-fetch';
import { Agent } from 'https';
import { writeFileSync } from 'fs';

const agent = new Agent({ rejectUnauthorized: false });

async function debug() {
  try {
    const res = await fetch('https://127.0.0.1:2999/liveclientdata/allgamedata', { agent });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
    writeFileSync('game-data.json', JSON.stringify(data, null, 2));
    console.log('\nSaved to game-data.json');
  } catch (err) {
    console.log('Error:', err.message);
    console.log('Make sure League is running with an active game!');
  }
}

debug();