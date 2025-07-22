import { inferPhase, markMIA } from "@league/shared/regionMapper.js";
import type { FeatureState, ChampPos } from "@league/shared/types.js";

export function extractFeatures(raw: any): FeatureState {
  const now = Date.now();
  const clock = Math.floor(raw?.gameData?.gameTime ?? 0);
  const phase = inferPhase(clock);

  const champs: ChampPos[] = (raw?.allPlayers ?? []).map((p: any) => ({
    name: p.summonerName,
    team: p.team?.toUpperCase() === "ORDER" ? "BLUE" : "RED",
    x: p.position?.x ?? 0,
    y: p.position?.y ?? 0,
    visible: !p.isDead,
    lastSeen: now
  }));

  const state: FeatureState = {
    clock,
    phase,
    mySide: "BLUE",
    goldDiff: 0,
    dragSpawnIn: null,
    baronSpawnIn: null,
    lanes: {
      TOP: { waveState: "UNKNOWN" },
      MID: { waveState: "UNKNOWN" },
      BOT: { waveState: "UNKNOWN" }
    },
    mia: markMIA(champs, now),
    cooldowns: {},
    champs
  };

  return state;
}
