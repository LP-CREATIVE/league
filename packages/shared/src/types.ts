export interface ChampPos {
  name: string;
  team: "BLUE" | "RED";
  x: number;
  y: number;
  visible: boolean;
  lastSeen: number;
}

export interface LaneState {
  waveState: "PUSHED" | "CRASHING" | "NEUTRAL" | "UNKNOWN";
  towerHp?: number;
}

export interface FeatureState {
  clock: number;
  phase: "EARLY" | "MID" | "LATE";
  mySide: "BLUE" | "RED";
  goldDiff: number;
  dragSpawnIn: number | null;
  baronSpawnIn: number | null;
  lanes: {
    TOP: LaneState;
    MID: LaneState;
    BOT: LaneState;
  };
  mia: string[];
  cooldowns: Record<string, boolean>;
  champs: ChampPos[];
}
