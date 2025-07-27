import "dotenv/config";
import pino from "pino";
import { fetchAllGameData } from "./liveClient.js";
import { extractFeatures } from "./featureExtractor.js";
import { askGPT } from "@league/llm-clients/gpt.js";
import fetch from "node-fetch";

const log = pino({ level: "info" });

const MIN_INTERVAL_MS = 15000;
const REGULAR_UPDATE_INTERVAL = 60000; // 1 minute in milliseconds
let lastVoiceTs = 0;
let lastRegularUpdateTs = 0;
let lastGameState: any = null;
let gameStartTime: number | null = null;
let lastEventId = -1;
let objectiveTimers = { dragon: 300, baron: 1200, herald: 480 };
let announcedObjectives = new Set<string>();
let enemyFlashTimers: Map<string, number> = new Map();
let enemyUltTimers: Map<string, number> = new Map();

async function postToBot(text: string) {
  await fetch(process.env.DISCORD_BOT_WEBHOOK || "http://localhost:4000/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });
}

async function processNewEvents(raw: any, features: any) {
  const events = raw?.events?.Events || [];
  const newEvents = events.filter((e: any) => e.EventID > lastEventId);
  const myChampion = raw?.activePlayer?.championName || "you";
  
  for (const event of newEvents) {
    lastEventId = event.EventID;
    const currentTime = features.clock;
    
    switch (event.EventName) {
      case 'TurretKilled':
        const isOurTurret = event.KillerName === 'ROWDY';
        const turretType = event.TurretKilled.includes('L1') ? 'Outer' : 
                          event.TurretKilled.includes('L2') ? 'Inner' : 
                          event.TurretKilled.includes('L3') ? 'Inhibitor' : 'Nexus';
        
        // Challenger-level macro calls
        if (isOurTurret) {
          await postToBot(`${turretType} down. Immediately rotate opposite side, force tempo trade or dive with numbers.`);
        } else {
          await postToBot(`Lost ${turretType}. Freeze opposite side wave, force enemy rotation, then collapse.`);
        }
        break;
        
      case 'DragonKill':
        objectiveTimers.dragon = currentTime + 300;
        const isDragonOurs = event.KillerName === 'ROWDY' || event.Assisters?.includes('ROWDY');
        
        if (isDragonOurs) {
          await postToBot(`Dragon secured. Reset immediately, buy control wards, setup 90 seconds early for next.`);
        } else {
          await postToBot(`Dragon lost. Trade for herald/towers topside NOW. Setup earlier next dragon.`);
        }
        break;
        
      case 'BaronKill':
        objectiveTimers.baron = currentTime + 360;
        const isBaronOurs = event.KillerName === 'ROWDY' || event.Assisters?.includes('ROWDY');
        if (isBaronOurs) {
          await postToBot(`Baron secured! 1-3-1 siege setup. DO NOT ARAM. Slow push sides, siege mid with patience.`);
        } else {
          await postToBot(`Enemy Baron. Clear supers, DO NOT CONTEST. Waveclear, scale, wait for mistake.`);
        }
        break;
        
      case 'ChampionKill':
        if (event.KillerName === 'ROWDY' || event.VictimName === 'ROWDY') {
          const isOurKill = event.KillerName === 'ROWDY';
          if (isOurKill) {
            await postToBot(`Kill secured. Shove wave, invade enemy jungle quadrant, deny camps and vision.`);
          } else {
            await postToBot(`Death. Enemy will invade your jungle. Concede camps, farm opposite side safely.`);
          }
        }
        break;
    }
  }
}

async function checkObjectiveTimers(features: any, raw: any) {
  const currentTime = features.clock;
  const myChampion = raw?.activePlayer?.championName || "your champion";
  
  if (objectiveTimers.dragon > 0 && 
      objectiveTimers.dragon - currentTime <= 60 && 
      objectiveTimers.dragon - currentTime > 45 &&
      !announcedObjectives.has(`dragon-${objectiveTimers.dragon}`)) {
    
    announcedObjectives.add(`dragon-${objectiveTimers.dragon}`);
    await postToBot(`Dragon 60 seconds. Back NOW, buy pinks. Shove lanes at 45s, move at 40s. Save summs.`);
  }
  
  if (currentTime >= 1140 && 
      objectiveTimers.baron - currentTime <= 60 && 
      objectiveTimers.baron - currentTime > 45 &&
      !announcedObjectives.has(`baron-${objectiveTimers.baron}`)) {
    
    announcedObjectives.add(`baron-${objectiveTimers.baron}`);
    await postToBot(`Baron 60 seconds. RESET NOW. Full clear topside vision. Shove bot at 45s. Group at 40s.`);
  }
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function loop() {
  try {
    const raw = await fetchAllGameData();
    const features = extractFeatures(raw);

    if (!gameStartTime && features.clock > 0) {
      gameStartTime = Date.now() - (features.clock * 1000);
      log.info("Game started, initializing timers");
      lastEventId = -1;
      announcedObjectives.clear();
    }

    const now = Date.now();
    const shouldSpeak = now - lastVoiceTs > MIN_INTERVAL_MS;

    if (raw?.events) {
      await processNewEvents(raw, features);
    }

    if (shouldSpeak) {
      await checkObjectiveTimers(features, raw);
    }

    const timeSinceLastUpdate = now - lastRegularUpdateTs;
    const is1MinInterval = timeSinceLastUpdate >= REGULAR_UPDATE_INTERVAL;

    if (is1MinInterval && shouldSpeak) {
      const gameMinutes = Math.floor(features.clock / 60);
      
      // Get champion and role from active player data
      const myChampion = raw?.activePlayer?.championName || features.champion || "Unknown";
      const myRole = features.position || "Unknown";
      const abilities = raw?.activePlayer?.abilities || {};
      const ultimateLevel = abilities.R?.abilityLevel || 0;
      const allPlayers = raw?.allPlayers || [];
      const activePlayer = raw?.activePlayer || {};
      
      const nextObjectives = [];
      if (objectiveTimers.dragon > features.clock) {
        nextObjectives.push(`Dragon at ${formatTime(objectiveTimers.dragon)}`);
      }
      if (objectiveTimers.baron > features.clock && features.clock > 1140) {
        nextObjectives.push(`Baron at ${formatTime(objectiveTimers.baron)}`);
      }

      const prompt = `You are a CHALLENGER-level League coach for ${myChampion} (${myRole}) at ${gameMinutes}:${Math.floor(features.clock % 60).toString().padStart(2, '0')}.

      CRITICAL GAME STATE:
      - My exact stats: Level ${features.level}, ${features.cs} CS (${(features.cs / gameMinutes).toFixed(1)}/min), ${Math.floor(features.gold)}g current, KDA: ${features.kills}/${features.deaths}/${features.assists}
      - My combat stats: ${features.ap > features.ad ? Math.floor(features.ap) + ' AP' : Math.floor(features.ad) + ' AD'}, ${Math.floor(features.hp)}/${Math.floor(features.maxHp)} HP, Ult level ${ultimateLevel}
      - Gold differential: ${features.goldDiff > 0 ? '+' : ''}${features.goldDiff}
      - Next objectives: ${nextObjectives.join(', ') || 'None spawned'}
      - Game phase: ${features.phase}
      - Wave states, jungle camps, vision control: ${JSON.stringify(features)}
      
      ADVANCED ANALYSIS REQUIRED:
      1. Wave manipulation: Should I freeze, slow push, or hard shove?
      2. Tempo windows: When is my next power spike? Enemy power spikes?
      3. Win condition: How does ${myChampion} specifically win THIS game state?
      4. Jungle tracking: Where is enemy jungler likely positioned?
      5. Summoner spell advantages: Who has flash/tp advantage?
      6. Vision denial: Which specific bushes/areas to control?
      7. Roam timings: Exact timing windows for roams based on wave state
      
      Provide ONE ultra-specific CHALLENGER-LEVEL macro call. Consider:
      - Exact CS timing for item breakpoints
      - Lane state manipulation for objective setup
      - Cross-map pressure and tempo trades
      - Specific jungle camp denial patterns
      - Vision line setups for next objective
      
      Format: [TIME SENSITIVE] Specific action with exact timing. Maximum 20 words.`;

      const res = await askGPT(prompt);
      const advice = res.text.trim();

      if (advice) {
        lastVoiceTs = now;
        lastRegularUpdateTs = now;
        await postToBot(advice);
        log.info({ advice, gameMinutes, champion: myChampion, type: "regular_update" }, "1-minute strategic update");
      }
    } else {
      const triggers = detectImportantEvents(features, lastGameState, raw);

      if (triggers.length > 0 && shouldSpeak) {
        const myChampion = raw?.activePlayer?.championName || features.champion || "Unknown";
        const prompt = `CHALLENGER coach for ${myChampion}. CRITICAL EVENTS: ${triggers.join(", ")}.
        
        My exact state: ${Math.floor(features.hp)}/${Math.floor(features.maxHp)} HP (${Math.floor((features.hp/features.maxHp)*100)}%), ${features.ap > features.ad ? Math.floor(features.ap) + ' AP' : Math.floor(features.ad) + ' AD'}, Level ${features.level}
        Summoners available: ${features.summs || 'unknown'}
        
        What's the OPTIMAL CHALLENGER-LEVEL response? Consider:
        - Animation cancels and mechanics specific to ${myChampion}
        - Exact ability rotation for maximum DPS
        - Positioning relative to terrain and objectives
        - Enemy cooldown windows to exploit
        
        Format: IMMEDIATE ACTION or "null". Maximum 15 words. BE PRECISE.`;

        const res = await askGPT(prompt);
        const advice = res.text.trim();

        if (advice && advice.toLowerCase() !== "null") {
          lastVoiceTs = now;
          await postToBot(advice);
          log.info({ advice, triggers, champion: myChampion, type: "event_triggered" }, "Event-based advice");
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

function detectImportantEvents(current: any, previous: any, raw: any): string[] {
  const triggers: string[] = [];

  if (!previous) return triggers;

  // CHALLENGER-LEVEL EVENT DETECTION
  
  // Gold breakpoints for item completions
  const goldBreakpoints = [1100, 1300, 2600, 2800, 3000, 3200];
  for (const breakpoint of goldBreakpoints) {
    if (current.gold >= breakpoint && (!previous.gold || previous.gold < breakpoint)) {
      triggers.push(`${breakpoint}g breakpoint - item spike available`);
    }
  }

  // Major gold swings that indicate won teamfight
  const goldSwing = current.goldDiff - (previous.goldDiff || 0);
  if (Math.abs(goldSwing) >= 2000) {
    triggers.push(`${goldSwing > 0 ? 'Won' : 'Lost'} teamfight (${goldSwing > 0 ? '+' : ''}${goldSwing}g swing)`);
  }

  // Enemy MIA patterns indicating objectives
  const missingEnemies = current.mia?.length || 0;
  const prevMissing = previous.mia?.length || 0;
  if (missingEnemies >= 3 && prevMissing < 3) {
    if (current.clock > 1200) {
      triggers.push("3+ MIA after 20min - Baron/Elder threat");
    } else if (current.clock > 480) {
      triggers.push("3+ MIA - Dragon/Herald threat");
    } else {
      triggers.push("3+ MIA early - Invade or dive incoming");
    }
  }

  // Level spike advantages
  if (current.level === 2 && (!previous.level || previous.level < 2) && current.clock < 180) {
    triggers.push("Level 2 spike - ALL IN NOW");
  }
  if (current.level === 6 && (!previous.level || previous.level < 6)) {
    triggers.push("Level 6 spike - Ultimate advantage window");
  }
  if (current.level === 9 && (!previous.level || previous.level < 9)) {
    triggers.push("Level 9 - Maxed ability spike");
  }
  if (current.level === 11 && (!previous.level || previous.level < 11)) {
    triggers.push("Level 11 - Rank 2 ultimate spike");
  }
  if (current.level === 16 && (!previous.level || previous.level < 16)) {
    triggers.push("Level 16 - Max ultimate spike");
  }

  // HP thresholds for different decisions
  const healthPercent = (current.hp / current.maxHp) * 100;
  const prevHealthPercent = previous ? (previous.hp / previous.maxHp) * 100 : 100;
  
  if (healthPercent < 20 && prevHealthPercent >= 20) {
    triggers.push("EXECUTE RANGE - Flash out immediately");
  } else if (healthPercent < 40 && prevHealthPercent >= 40) {
    triggers.push("40% HP - Bait then turn with ultimate");
  } else if (healthPercent < 60 && prevHealthPercent >= 60) {
    triggers.push("60% HP - Trade stance, force enemy cooldowns");
  }

  // CS/min dropping (getting zoned)
  const currentCSperMin = current.cs / (current.clock / 60);
  const previousCSperMin = previous.cs / (previous.clock / 60);
  if (currentCSperMin < previousCSperMin - 1) {
    triggers.push("CS/min dropping - Being zoned, call jungler");
  }

  // Flash timers and advantages
  if (current.clock % 300 === 0 && current.clock > 0) {
    triggers.push("5-min mark - Track enemy flash timers");
  }

  return triggers;
}

log.info("Starting CHALLENGER-LEVEL League coach...");
log.info("Ultra-high ELO analysis: Wave manipulation, tempo windows, exact timings");
loop();