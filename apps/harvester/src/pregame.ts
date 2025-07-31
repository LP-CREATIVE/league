import pino from "pino";
import { askGPT } from "@league/llm-clients/gpt.js";
import { getChampionName as getChampName, ROLE_NAMES } from "./champion-data.js";
import { getLCUFetch } from "./lcu-connector.js";

const log = pino({ level: "info" });

// Configuration for pregame analysis
export const PREGAME_CONFIG = {
  CHECK_INTERVAL: 3000, // Check every 3 seconds
  GPT_MODEL: "gpt-4o",
  DEBUG: true
};

// Debug logger
function debug(message: string, data?: any) {
  if (PREGAME_CONFIG.DEBUG) {
    console.log(`[PREGAME ${new Date().toISOString()}] ${message}`);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

// Champion select session data structure
interface ChampSelectSession {
  actions: Array<Array<{
    actorCellId: number;
    championId: number;
    completed: boolean;
    id: number;
    type: string; // "ban" or "pick"
  }>>;
  bans: {
    myTeamBans: number[];
    numBans: number;
    theirTeamBans: number[];
  };
  myTeam: Array<{
    assignedPosition: string;
    cellId: number;
    championId: number;
    championPickIntent: number;
    nameVisibilityType: string;
    obfuscatedPuuid: string;
    obfuscatedSummonerId: number;
    puuid: string;
    selectedSkinId: number;
    spell1Id: number;
    spell2Id: number;
    summonerId: number;
    team: number;
    wardSkinId: number;
  }>;
  theirTeam: Array<{
    assignedPosition: string;
    cellId: number;
    championId: number;
    championPickIntent: number;
    nameVisibilityType: string;
    obfuscatedPuuid: string;
    obfuscatedSummonerId: number;
    puuid: string;
    selectedSkinId: number;
    spell1Id: number;
    spell2Id: number;
    summonerId: number;
    team: number;
    wardSkinId: number;
  }>;
  timer: {
    adjustedTimeLeftInPhase: number;
    internalNowInEpochMs: number;
    isInfinite: boolean;
    phase: string;
    totalTimeInPhase: number;
  };
  localPlayerCellId: number;
}

// Get champion name by ID
function getChampionName(championId: number): string {
  return getChampName(championId);
}

// Fetch champion select data
export async function fetchChampSelectData(): Promise<ChampSelectSession | null> {
  const lcuFetch = getLCUFetch();
  if (!lcuFetch) {
    return null; // LCU not available
  }
  
  try {
    const data = await lcuFetch('/lol-champ-select/v1/session');
    
    if (!data) {
      return null; // Not in champion select
    }
    
    const session = data as any;
    debug("Fetched champion select data", {
      phase: session.timer?.phase,
      myTeamSize: session.myTeam?.length,
      theirTeamSize: session.theirTeam?.length
    });
    
    return session as ChampSelectSession;
  } catch (error) {
    log.error(error, "Failed to fetch champion select data");
    return null;
  }
}

// Get current summoner data
async function getCurrentSummoner(): Promise<{ summonerId: number } | null> {
  const lcuFetch = getLCUFetch();
  if (!lcuFetch) {
    return null;
  }
  
  try {
    const data = await lcuFetch('/lol-summoner/v1/current-summoner');
    return data as { summonerId: number };
  } catch (error) {
    log.error(error, "Failed to fetch summoner data");
    return null;
  }
}

// Analyze team compositions during champion select
export async function analyzePregameComps(session: ChampSelectSession): Promise<string | null> {
  debug("Starting pregame composition analysis");
  
  // Get current summoner to identify which team we're on
  const currentSummoner = await getCurrentSummoner();
  if (!currentSummoner) {
    log.error("Could not fetch current summoner");
    return null;
  }
  
  // Find our player in the teams
  const ourPlayer = session.myTeam.find(p => p.summonerId === currentSummoner.summonerId);
  if (!ourPlayer) {
    log.error("Could not find player in team");
    return null;
  }
  
  // Build team composition data
  const myTeamComp = session.myTeam.map(player => ({
    position: player.assignedPosition,
    championId: player.championId,
    championName: getChampionName(player.championId),
    isLocked: isChampionLocked(session, player.cellId)
  }));
  
  const theirTeamComp = session.theirTeam.map(player => ({
    position: player.assignedPosition,
    championId: player.championId,
    championName: getChampionName(player.championId),
    isLocked: isChampionLocked(session, player.cellId)
  }));
  
  // Get ban information
  const myBans = session.bans.myTeamBans.map(id => getChampionName(id));
  const theirBans = session.bans.theirTeamBans.map(id => getChampionName(id));
  
  debug("Team compositions", {
    myTeam: myTeamComp,
    theirTeam: theirTeamComp,
    myBans,
    theirBans
  });
  
  // Find junglers
  const myJungler = myTeamComp.find(p => p.position.toLowerCase() === "jungle");
  const theirJungler = theirTeamComp.find(p => p.position.toLowerCase() === "jungle");
  
  if (!myJungler || !myJungler.championId) {
    debug("No jungler selected yet on our team");
    return null;
  }
  
  // Build prompt for pregame analysis
  const prompt = `You are a CHALLENGER jungle coach analyzing a completed League of Legends champion select.

YOUR TEAM:
${myTeamComp.map(p => `${p.position}: ${p.championName}`).join('\n')}

ENEMY TEAM:
${theirTeamComp.map(p => `${p.position}: ${p.championName}`).join('\n')}

BANS:
Your team banned: ${myBans.join(', ') || 'None'}
Enemy team banned: ${theirBans.join(', ') || 'None'}

YOUR JUNGLER: ${myJungler.championName}
ENEMY JUNGLER: ${theirJungler?.championName || 'Unknown'}

Create a pregame analysis following this format:

FINAL DRAFT ANALYSIS: ${myJungler.championName}

TEAM COMPOSITION BREAKDOWN
1. Your Team Comp:
   - Comp Type: [teamfight/pick/poke/split push/etc]
   - Win Condition: [How your team wins with this comp]
   - Power Spikes: [When your team is strongest]

2. Enemy Team Comp:
   - Comp Type: [teamfight/pick/poke/split push/etc]
   - Win Condition: [How they want to win]
   - Power Spikes: [When they are strongest]

JUNGLE MATCHUP: ${myJungler.championName} vs ${theirJungler?.championName || 'Unknown'}
- Clear Speed: [Who clears faster and why it matters]
- Early Pressure: [Who has more early game impact]
- Scaling: [Who scales better into late game]
- Key Levels: [Important power spike levels for both junglers]

LANE SYNERGIES
1. Best Gank Setup: [Which of your lanes has the best gank setup]
2. Priority Lane: [Which lane to focus on and why]
3. Enemy Threats: [Which enemy lanes are most dangerous]

EARLY GAME PLAN
1. Optimal Start: [Red/Blue and pathing direction based on matchups]
2. First Clear Goals: [What you want to achieve by 3:15]
3. Scuttle Priority: [Which scuttle to prioritize and why]
4. First Gank Window: [Best opportunity for first gank]

KEY OBJECTIVES
- Dragon Priority: [High/Medium/Low and reasoning]
- Herald Priority: [Timing and lane to use it]
- Early Tower Focus: [Which lane to help push first]

ITEMIZATION
- Core Rush: [First item based on enemy comp]
- Defensive Needs: [Any specific defensive items needed]
- Boot Choice: [Which boots and why]

Be extremely specific to these exact 10 champions and provide a clear game plan.`;

  debug("Sending pregame prompt to GPT", { promptLength: prompt.length });
  
  try {
    const response = await askGPT(prompt, PREGAME_CONFIG.GPT_MODEL);
    debug("Received GPT pregame response", {
      responseLength: response.text.length,
      tokensUsed: response.tokens
    });
    
    return response.text;
  } catch (error) {
    log.error(error, "Failed to generate pregame analysis");
    return null;
  }
}

// Check if a champion pick is locked in
function isChampionLocked(session: ChampSelectSession, cellId: number): boolean {
  for (const actionGroup of session.actions) {
    for (const action of actionGroup) {
      if (action.actorCellId === cellId && 
          action.type === "pick" && 
          action.completed) {
        return true;
      }
    }
  }
  return false;
}

// Check if all champions are locked
function allChampionsLocked(session: ChampSelectSession): boolean {
  const allPlayers = [...session.myTeam, ...session.theirTeam];
  return allPlayers.every(player => isChampionLocked(session, player.cellId));
}

// Get game flow state
async function getGameflowPhase(): Promise<string | null> {
  const lcuFetch = getLCUFetch();
  if (!lcuFetch) {
    return null;
  }
  
  try {
    const data = await lcuFetch('/lol-gameflow/v1/gameflow-phase');
    return data as string;
  } catch (error) {
    return null;
  }
}

// Monitor champion select and provide updates
export function monitorChampionSelect(
  onUpdate: (analysis: string) => Promise<void>
): void {
  let hasAnalyzedFinalComp = false;
  let lastGameflowPhase: string | null = null;
  
  const checkInterval = setInterval(async () => {
    // First check gameflow phase
    const gameflowPhase = await getGameflowPhase();
    
    if (gameflowPhase !== 'ChampSelect') {
      if (lastGameflowPhase === 'ChampSelect') {
        debug(`Left champion select - now in ${gameflowPhase}`);
        hasAnalyzedFinalComp = false;
      }
      lastGameflowPhase = gameflowPhase;
      return;
    }
    
    lastGameflowPhase = gameflowPhase;
    
    const session = await fetchChampSelectData();
    
    if (!session) {
      return;
    }
    
    // Check if all 10 champions are locked in
    const allLocked = allChampionsLocked(session);
    
    // Only analyze once when all champions are locked
    if (allLocked && !hasAnalyzedFinalComp) {
      // Verify we have all 10 champions selected
      const myTeamPicks = session.myTeam.filter(p => p.championId > 0).length;
      const enemyTeamPicks = session.theirTeam.filter(p => p.championId > 0).length;
      
      if (myTeamPicks === 5 && enemyTeamPicks === 5) {
        debug("All 10 champions locked - generating final analysis");
        hasAnalyzedFinalComp = true;
        
        const analysis = await analyzePregameComps(session);
        if (analysis) {
          await onUpdate(analysis);
        }
      }
    }
    
  }, PREGAME_CONFIG.CHECK_INTERVAL);
}