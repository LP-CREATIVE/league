import type { ChampPos } from "./types.js";

const MAP = 14870;
export function toRegion(x: number, y: number): "TOP" | "MID" | "BOT" | "RIVER" | "JUNGLE" {
  const midBand = 2200;
  if (Math.abs(x - y) < midBand) return "RIVER";
  if (y > MAP * 0.6 && x < MAP * 0.4) return "TOP";
  if (x > MAP * 0.6 && y < MAP * 0.4) return "BOT";
  return "JUNGLE";
}

export function inferPhase(clock: number): "EARLY" | "MID" | "LATE" {
  if (clock < 900) return "EARLY";
  if (clock < 1800) return "MID";
  return "LATE";
}

export function markMIA(champs: ChampPos[], now: number, thresholdMs = 8000): string[] {
  return champs.filter(c => c.team !== "BLUE" && (now - c.lastSeen) > thresholdMs && !c.visible).map(c => c.name);
}
