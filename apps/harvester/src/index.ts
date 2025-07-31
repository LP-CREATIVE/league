import "dotenv/config";
import pino from "pino";
import { askGPT } from "@league/llm-clients/gpt.js";
import fetch from "node-fetch";
import https from "https";
import { monitorChampionSelect } from "./pregame.js";

const log = pino({ level: "info" });
const agent = new https.Agent({ rejectUnauthorized: false });

// Configuration
const CONFIG = {
  API_URL: "https://127.0.0.1:2999/liveclientdata/playerlist",
  GAME_DATA_URL: "https://127.0.0.1:2999/liveclientdata/allgamedata",
  DISCORD_WEBHOOK: process.env.DISCORD_BOT_WEBHOOK || "http://localhost:4000/speak",
  CHECK_INTERVAL: 5000, // Check every 5 seconds
  MAX_MESSAGE_LENGTH: 1000, // Increased chunk size for Discord TTS
  GPT_MODEL: "gpt-4o", // Use gpt-4o-mini for cheaper option
  DEBUG: true // Enable detailed console logging
};

// Debug logger
function debug(message: string, data?: any) {
  if (CONFIG.DEBUG) {
    console.log(`[${new Date().toISOString()}] ${message}`);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

// Fetch game data from League client
async function fetchGameData(): Promise<{ players: any[], activePlayer: any } | null> {
  try {
    // Fetch both player list and full game data
    const [playersRes, gameDataRes] = await Promise.all([
      fetch(CONFIG.API_URL, { agent }),
      fetch(CONFIG.GAME_DATA_URL, { agent })
    ]);
    
    if (!playersRes.ok || !gameDataRes.ok) {
      if (playersRes.status === 404 || gameDataRes.status === 404) {
        return null; // Game not running
      }
      throw new Error(`Live Client fetch failed`);
    }
    
    const players = await playersRes.json() as any[];
    const gameData = await gameDataRes.json() as any;
    
    debug("Fetched game data", { 
      playerCount: players.length,
      activePlayerName: gameData.activePlayer?.summonerName 
    });
    
    return { players, activePlayer: gameData.activePlayer };
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      return null; // League client not running
    }
    log.error(error, "Failed to fetch game data");
    return null;
  }
}

// Find jungler in player data
function findJungler(players: any[], team?: string): any | null {
  const jungler = players.find(p => 
    (team ? p.team === team : true) &&
    (p.position === "JUNGLE" ||
     p.summonerSpells?.summonerSpellOne?.displayName === "Smite" ||
     p.summonerSpells?.summonerSpellTwo?.displayName === "Smite")
  );
  
  if (jungler) {
    debug(`Found jungler: ${jungler.championName} on team ${jungler.team}`);
  }
  
  return jungler;
}

// Generate strategic analysis
async function generateJungleAnalysis(gameData: { players: any[], activePlayer: any }): Promise<string | null> {
  debug("Starting jungle analysis generation");
  
  const { players: playerData, activePlayer } = gameData;
  
  // Find YOUR player using the activePlayer data (this is ALWAYS you)
  const you = playerData.find(p => 
    p.summonerName === activePlayer.summonerName
  );
  
  if (!you) {
    log.error("Could not find your player in the game");
    debug("Failed to match activePlayer", {
      activePlayerName: activePlayer?.summonerName,
      playerNames: playerData.map(p => p.summonerName)
    });
    return null;
  }
  
  debug(`Found your player: ${you.summonerName} playing ${you.championName} on team ${you.team}`);

  // Now correctly identify teams based on YOUR team
  const yourTeam = playerData.filter(p => p.team === you.team);
  const enemyTeam = playerData.filter(p => p.team !== you.team);
  
  debug("Team breakdown", {
    yourTeamSize: yourTeam.length,
    enemyTeamSize: enemyTeam.length,
    yourTeamSide: you.team
  });
  
  const yourJungler = findJungler(yourTeam);
  if (!yourJungler) {
    log.error("No jungler found on your team");
    return null;
  }

  const enemyJungler = findJungler(enemyTeam);
  debug(`Matchup: ${yourJungler.championName} vs ${enemyJungler?.championName || 'Unknown'}`);

  // Format team for display
  const formatTeam = (team: any[]) => team
    .sort((a, b) => {
      const order = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
      return order.indexOf(a.position) - order.indexOf(b.position);
    })
    .map(p => `${p.championName} (${p.position || 'Unknown'})`)
    .join(', ');

  const yourTeamComp = formatTeam(yourTeam);
  const enemyTeamComp = formatTeam(enemyTeam);
  
  debug("Team compositions", {
    yourTeam: yourTeamComp,
    enemyTeam: enemyTeamComp
  });

  const prompt = `You are a CHALLENGER jungle coach analyzing a League of Legends game.

JUNGLER: ${yourJungler.championName}
Your Team: ${yourTeamComp}
Enemy Team: ${enemyTeamComp}
Enemy Jungler: ${enemyJungler?.championName || 'Unknown'}

Create a strategic jungle guide following this EXACT format:

${yourJungler.championName} Jungle: Strategic Game Plan

MATCHUP ANALYSIS

PHASE 1: PRE-GAME ANALYSIS
1. Team Composition Assessment:
Your Win Condition: [Identify comp type and 2-3 sentences how your team wins through jungle impact]
Enemy Win Condition: [Identify their comp type and 2-3 sentences how to prevent their win condition]

2. Jungle Matchup: ${yourJungler.championName} vs ${enemyJungler?.championName || 'Unknown'}
Threat Level: [HIGH/MEDIUM/LOW]
[2-3 sentences about 1v1 strength, invade threat, early game pressure]
Your Advantages: [2-3 sentences about what you do better - clear speed, ganks, scaling]

PHASE 2: EARLY GAME EXECUTION (0-10 MIN)
1. Jungle Pathing:
Starting Route: [Specific path like "Red > Krugs > Raptors > Look for gank"]
Why This Path: [1-2 sentences explaining the reasoning]

2. Gank Priority:
FIRST: [Lane] - [Why this lane is priority #1]
SECOND: [Lane] - [Why this lane is priority #2]
THIRD: [Lane] - [Why this lane is priority #3]

3. Key Timings:
- 3:15: [Scuttle crab approach]
- 5:00: [First dragon setup]
- 8:00: [Herald consideration]

PHASE 3: MID GAME STRATEGY (10-20 MIN)
1. Power Spikes:
Your Spike: [When ${yourJungler.championName} is strongest]
Team Spike: [When your comp comes online]

2. Objective Priority:
[Specific objective focus based on team comps]

3. Vision Control:
[Where to place/deny vision as jungler]

WIN CONDITIONS
How You Win:
1. [Specific jungle action that leads to victory]
2. [Team-based win condition you enable]
3. [Late game transition plan]

How You Lose:
1. [Enemy jungler's win condition against you]
2. [Team comp weakness to avoid]
3. [Common mistake to prevent]

Be specific to ${yourJungler.championName}'s abilities and these exact team compositions.`;

  debug("Sending prompt to GPT", { promptLength: prompt.length });

  try {
    const response = await askGPT(prompt, CONFIG.GPT_MODEL);
    debug("Received GPT response", {
      responseLength: response.text.length,
      tokensUsed: response.tokens,
      cost: response.costUsd
    });
    
    if (CONFIG.DEBUG) {
      console.log("\n=== FULL GPT RESPONSE ===");
      console.log(response.text);
      console.log("=== END GPT RESPONSE ===\n");
    }
    
    return response.text;
  } catch (error) {
    log.error(error, "Failed to generate analysis");
    return null;
  }
}

// Format analysis for Discord TTS - improved splitting logic
function formatForDiscord(analysis: string): string[] {
  debug("Formatting analysis for Discord", { totalLength: analysis.length });
  
  const messages: string[] = [];
  
  // Split by major sections (double newlines)
  const majorSections = analysis.split(/\n\n+/);
  
  for (const section of majorSections) {
    if (!section.trim()) continue;
    
    // Check if this is a header line (all caps or contains "PHASE" or "WIN CONDITIONS")
    const isHeader = section === section.toUpperCase() || 
                    section.includes("PHASE") || 
                    section.includes("WIN CONDITIONS") ||
                    section.includes("MATCHUP ANALYSIS");
    
    if (isHeader || section.length <= CONFIG.MAX_MESSAGE_LENGTH) {
      messages.push(section.trim());
    } else {
      // Split by lines first
      const lines = section.split('\n');
      let currentMessage = '';
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        
        // Check if adding this line would exceed limit
        const potentialMessage = currentMessage ? `${currentMessage} ${trimmedLine}` : trimmedLine;
        
        if (potentialMessage.length > CONFIG.MAX_MESSAGE_LENGTH) {
          // Send current message if it exists
          if (currentMessage) {
            messages.push(currentMessage);
            currentMessage = '';
          }
          
          // If the line itself is too long, split by sentences
          if (trimmedLine.length > CONFIG.MAX_MESSAGE_LENGTH) {
            const sentences = trimmedLine.match(/[^.!?]+[.!?]+/g) || [trimmedLine];
            
            for (const sentence of sentences) {
              const trimmedSentence = sentence.trim();
              
              if (currentMessage && (currentMessage + ' ' + trimmedSentence).length > CONFIG.MAX_MESSAGE_LENGTH) {
                messages.push(currentMessage);
                currentMessage = trimmedSentence;
              } else {
                currentMessage = currentMessage ? `${currentMessage} ${trimmedSentence}` : trimmedSentence;
              }
            }
          } else {
            currentMessage = trimmedLine;
          }
        } else {
          currentMessage = potentialMessage;
        }
      }
      
      // Add any remaining content
      if (currentMessage) {
        messages.push(currentMessage);
      }
    }
  }
  
  debug(`Split into ${messages.length} messages`);
  
  if (CONFIG.DEBUG) {
    console.log("\n=== MESSAGE BREAKDOWN ===");
    messages.forEach((msg, i) => {
      console.log(`\nMessage ${i + 1} (${msg.length} chars):`);
      console.log(`"${msg}"`);
    });
    console.log("=== END MESSAGE BREAKDOWN ===\n");
  }
  
  return messages;
}

// Send message to Discord bot with detailed logging
async function sendToDiscord(message: string, waitForCompletion: boolean = true): Promise<void> {
  debug(`Sending to Discord: "${message.substring(0, 50)}..."`, {
    fullLength: message.length,
    waitForCompletion
  });
  
  try {
    const response = await fetch(CONFIG.DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message, waitForCompletion })
    });
    
    if (!response.ok) {
      const error = await response.text();
      log.error({ status: response.status, error }, "Discord webhook failed");
      debug("Discord webhook error", { status: response.status, error });
    } else {
      debug("Successfully sent to Discord");
    }
  } catch (error) {
    log.error(error, "Failed to send to Discord");
    debug("Exception sending to Discord", error);
  }
}

// Main application loop
async function main(): Promise<void> {
  console.log("=================================");
  console.log("League Jungle Coach v3.0");
  console.log("=================================");
  console.log(`Debug mode: ${CONFIG.DEBUG ? 'ENABLED' : 'DISABLED'}`);
  console.log(`GPT Model: ${CONFIG.GPT_MODEL}`);
  console.log(`Message chunk size: ${CONFIG.MAX_MESSAGE_LENGTH} chars`);
  console.log("Messages wait for completion: YES");
  console.log("Features: Pregame Analysis + In-Game Coaching");
  console.log("=================================\n");
  
  log.info("League Jungle Coach started - monitoring champion select and games...");
  
  // Start monitoring champion select
  console.log("🔍 Monitoring champion select...");
  monitorChampionSelect(async (analysis) => {
    console.log("\n🏆 CHAMPION SELECT ANALYSIS 🏆");
    await sendToDiscord("Champion select analysis incoming...");
    
    const messages = formatForDiscord(analysis);
    for (let i = 0; i < messages.length; i++) {
      console.log(`\n[PREGAME ${i + 1}/${messages.length}] Sending message...`);
      await sendToDiscord(messages[i], true);
      console.log(`✓ Pregame message ${i + 1} completed`);
    }
    
    console.log("\n✅ PREGAME ANALYSIS SENT! ✅\n");
  });
  
  let currentGameId: string | null = null;
  let isAnalyzing = false;
  
  setInterval(async () => {
    if (isAnalyzing) return;
    
    const gameData = await fetchGameData();
    
    if (!gameData || gameData.players.length === 0) {
      if (currentGameId) {
        debug("Game ended");
        log.info("Game ended");
        currentGameId = null;
      }
      return;
    }
    
    const gameId = gameData.players
      .map(p => p.summonerName)
      .sort()
      .join(',');
    
    if (gameId === currentGameId) return;
    
    console.log("\n🎮 NEW GAME DETECTED! 🎮");
    debug("New game detected", { gameId });
    
    currentGameId = gameId;
    isAnalyzing = true;
    
    try {
      await sendToDiscord("Game detected. Analyzing jungle matchup...");
      
      const analysis = await generateJungleAnalysis(gameData);
      
      if (analysis) {
        const messages = formatForDiscord(analysis);
        
        console.log(`\n📨 SENDING ${messages.length} MESSAGES TO DISCORD 📨`);
        
        for (let i = 0; i < messages.length; i++) {
          console.log(`\n[${i + 1}/${messages.length}] Sending message...`);
          console.log(`Length: ${messages[i].length} chars`);
          console.log(`Preview: "${messages[i].substring(0, 100)}..."`);
          
          // Wait for each message to complete before sending the next
          await sendToDiscord(messages[i], true);
          console.log(`✓ Message ${i + 1} completed`);
        }
        
        console.log("\n✅ ALL MESSAGES SENT SUCCESSFULLY! ✅\n");
        log.info("Analysis complete and sent to Discord");
      } else {
        await sendToDiscord("Unable to analyze this game. Check if there's a jungler on both teams.");
      }
    } catch (error) {
      console.error("\n❌ ERROR DURING ANALYSIS ❌");
      log.error(error, "Error during game analysis");
      await sendToDiscord("An error occurred during analysis. Check the logs.");
    } finally {
      isAnalyzing = false;
    }
    
  }, CONFIG.CHECK_INTERVAL);
}

// Start the application
main().catch(err => {
  console.error("❌ FATAL ERROR ❌");
  log.error(err, "Fatal error starting application");
  process.exit(1);
});