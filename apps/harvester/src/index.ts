import "dotenv/config";
import "dotenv/config";
import pino from "pino";
import { fetchAllGameData } from "./liveClient.js";
import { extractFeatures } from "./featureExtractor.js";
import { trivialRuleAdvice } from "@league/shared/ruleEngine.js";
import { askGPT } from "@league/llm-clients/gpt.js";
import fetch from "node-fetch";

const log = pino({ level: "info" });

const RATE_SECONDS = parseInt(process.env.RATE_LIMIT_SECONDS ?? "8", 10);
const MIN_INTERVAL_MS = RATE_SECONDS * 1000;
let lastVoiceTs = 0;

async function loop() {
  try {
    const raw = await fetchAllGameData();
    const features = extractFeatures(raw);

    let advice = trivialRuleAdvice(features);
    if (!advice) {
      const prompt = `You are Coach P. One actionable call (<=15 words) for BLUE team.\nJSON:\n${JSON.stringify(features)}`;
      const res = await askGPT(prompt);
      advice = res.text.trim();
    }

    const now = Date.now();
    if (advice && now - lastVoiceTs > MIN_INTERVAL_MS) {
      lastVoiceTs = now;
      await postToBot(advice);
      log.info({ advice }, "Spoke advice");
    }
  } catch (e) {
    log.warn(e, "loop error");
  } finally {
    setTimeout(loop, 250);
  }
}

async function postToBot(text: string) {
  await fetch(process.env.DISCORD_BOT_WEBHOOK || "http://localhost:4000/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });
}

loop();
