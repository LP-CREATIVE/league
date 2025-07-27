import "dotenv/config";
import pino from "pino";
import { fetchAllGameData } from "./liveClient.js";
import { extractFeatures } from "./featureExtractor.js";
import { askGPT } from "@league/llm-clients/gpt.js";
import fetch from "node-fetch";

const log = pino({ level: "info" });

const MIN_INTERVAL_MS = 15000; // Don't speak more than once per 15 seconds
const REGULAR_UPDATE_INTERVAL = 180000; // 3 minutes in milliseconds
let lastVoiceTs = 0;
let lastRegularUpdateTs = 0;
let lastGameState: any = null;
let gameStartTime: number | null = null;

async function loop() {
  try {
    const raw = await fetchAllGameData();
    const features = extractFeatures(raw);
    
    // Initialize game start time
    if (!gameStartTime && features.clock > 0) {
      gameStartTime = Date.now() - (features.clock * 1000);
      log.info("Game started, initializing timers");
    }
    
    const now = Date.now();
    const shouldSpeak = now - lastVoiceTs > MIN_INTERVAL_MS;
    
    // Check for regular 3-minute update
    const timeSinceLastUpdate = now - lastRegularUpdateTs;
    const is3MinInterval = timeSinceLastUpdate >= REGULAR_UPDATE_INTERVAL;
    
    if (is3MinInterval && shouldSpeak) {
      const gameMinutes = Math.floor(features.clock / 60);
      
      const prompt = `You are a League coach analyzing the game at ${gameMinutes} minutes.
      Game state: ${JSON.stringify(features)}
      Give ONE strategic call for the next 3 minutes. Consider:
      - Current game phase: ${features.phase}
      - Gold difference: ${features.goldDiff}
      - Upcoming objectives
      - Team positioning needs
      Keep it under 12 words, be specific and actionable.`;
      
      const res = await askGPT(prompt);
      const advice = res.text.trim();
      
      if (advice) {
        lastVoiceTs = now;
        lastRegularUpdateTs = now;
        await postToBot(advice);
        log.info({ advice, gameMinutes, type: "regular_update" }, "3-minute strategic update");
      }
    } else {
      // Check for important events
      const triggers = detectImportantEvents(features, lastGameState);
      
      if (triggers.length > 0 && shouldSpeak) {
        const prompt = `You are a League coach. Important events: ${triggers.join(", ")}. 
        Game state: ${JSON.stringify(features)}
        Give ONE urgent call (under 10 words) if immediate action needed, otherwise "null".`;
        
        const res = await askGPT(prompt);
        const advice = res.text.trim();
        
        if (advice && advice.toLowerCase() !== "null") {
          lastVoiceTs = now;
          await postToBot(advice);
          log.info({ advice, triggers, type: "event_triggered" }, "Event-based advice");
        }
      }
    }
    
    lastGameState = features;
  } catch (e) {
    log.warn(e, "loop error");
  } finally {
    setTimeout(loop, 1000);
  }
}

function detectImportantEvents(current: any, previous: any): string[] {
  const triggers: string[] = [];
  
  if (!previous) return triggers;
  
  // Dragon spawning very soon (20 seconds)
  if (current.dragSpawnIn && current.dragSpawnIn > 0 && current.dragSpawnIn <= 20 && 
      (!previous.dragSpawnIn || previous.dragSpawnIn > 20)) {
    triggers.push("Dragon spawning in 20 seconds");
  }
  
  // Baron spawning soon (30 seconds)
  if (current.baronSpawnIn && current.baronSpawnIn > 0 && current.baronSpawnIn <= 30 &&
      (!previous.baronSpawnIn || previous.baronSpawnIn > 30)) {
    triggers.push("Baron spawning in 30 seconds");
  }
  
  // Major gold swing (3k+ in last update)
  const goldSwing = current.goldDiff - (previous.goldDiff || 0);
  if (Math.abs(goldSwing) >= 3000) {
    triggers.push(`Major gold swing: ${goldSwing > 0 ? '+' : ''}${goldSwing}`);
  }
  
  // 4+ enemies missing (likely baron/elder)
  const missingEnemies = current.mia?.length || 0;
  if (missingEnemies >= 4 && current.clock > 1200) { // After 20 min
    triggers.push("4+ enemies missing, check baron");
  }
  
  // Ace detection (would need event tracking)
  // Inhib down (would need event tracking)
  
  return triggers;
}

async function postToBot(text: string) {
  await fetch(process.env.DISCORD_BOT_WEBHOOK || "http://localhost:4000/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });
}

log.info("Starting League coach monitor...");
log.info("Will provide updates every 3 minutes plus urgent event callouts");
loop();
