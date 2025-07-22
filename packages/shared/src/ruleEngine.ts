import type { FeatureState } from "./types.js";

export function trivialRuleAdvice(state: FeatureState): string | null {
  if (state.dragSpawnIn !== null && state.dragSpawnIn < 60) {
    return "Group for dragon: push mid and ward river.";
  }
  return null;
}
