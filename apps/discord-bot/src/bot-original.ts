import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });
import { Client, GatewayIntentBits, ChannelType, VoiceChannel } from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
  EndBehaviorType,
  VoiceConnection,
} from "@discordjs/voice";
import Prism from "prism-media";
import express from "express";
import pino from "pino";
import { Readable } from "stream";
import fsProm from "fs/promises";
import { createReadStream as fsCreateReadStream } from "fs";
import OpenAI from "openai";
import { pcmToWav } from "./wav";

const log = pino({ level: "info" });
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ],
});

// Store connections for each server
const serverConnections = new Map<string, {
  connection: VoiceConnection;
  player: ReturnType<typeof createAudioPlayer>;
  messageQueue: { userId: string; text: string }[];
  queueTimer: NodeJS.Timeout | null;
  isProcessing: boolean;
  lastResponseTime: number;
  inConversation: boolean;
}>();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Get configured servers
function getConfiguredServers(): Array<{ guildId: string; voiceChannelId: string }> {
  const servers = [];
  let i = 1;
  
  while (process.env[`DISCORD_GUILD_ID_${i}`]) {
    servers.push({
      guildId: process.env[`DISCORD_GUILD_ID_${i}`]!,
      voiceChannelId: process.env[`DISCORD_VOICE_CHANNEL_ID_${i}`]!
    });
    i++;
  }
  
  return servers;
}

// Bot triggers
const botTriggers = ["bot", "yo", "hey", "bro", "what's good", "what's up", "sup"];

client.once("ready", async () => {
  log.info("Bot is ready, connecting to configured servers...");
  
  const servers = getConfiguredServers();
  
  for (const serverConfig of servers) {
    try {
      await connectToServer(serverConfig.guildId, serverConfig.voiceChannelId);
    } catch (e) {
      log.error({ guildId: serverConfig.guildId, error: e }, "Failed to connect to server");
    }
  }
  
  log.info(`Connected to ${serverConnections.size} servers`);
});

async function connectToServer(guildId: string, voiceChannelId: string) {
  const guild = await client.guilds.fetch(guildId);
  const channel = await guild.channels.fetch(voiceChannelId);
  
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    throw new Error(`Voice channel not found`);
  }
  
  const vc = channel as VoiceChannel;
  const player = createAudioPlayer();
  
  const connection = joinVoiceChannel({
    channelId: vc.id,
    guildId: vc.guild.id,
    adapterCreator: vc.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });
  
  connection.subscribe(player);
  
  serverConnections.set(guildId, {
    connection,
    player,
    messageQueue: [],
    queueTimer: null,
    isProcessing: false,
    lastResponseTime: 0,
    inConversation: false
  });
  
  player.on("error", (e) => log.error({ guildId, error: e }, "Audio error"));
  player.on(AudioPlayerStatus.Playing, () => {
    const server = serverConnections.get(guildId);
    if (server) server.isProcessing = true;
  });
  player.on(AudioPlayerStatus.Idle, () => {
    const server = serverConnections.get(guildId);
    if (server) server.isProcessing = false;
  });
  
  setupVoiceReceiver(guildId, connection);
  
  log.info({ guildId, channelId: voiceChannelId }, "Connected to voice channel");
}

function setupVoiceReceiver(guildId: string, connection: VoiceConnection) {
  const receiver = connection.receiver;
  
  receiver.speaking.on("start", (userId: string) => {
    const server = serverConnections.get(guildId);
    if (!server || server.isProcessing) return;
    
    captureUser(guildId, userId, receiver).catch((e: any) => 
      log.error({ guildId, error: e }, "Capture error")
    );
  });
}

function shouldRespond(guildId: string, messages: { userId: string; text: string }[]): boolean {
  const server = serverConnections.get(guildId);
  if (!server) return false;
  
  const combinedText = messages.map(m => m.text).join(" ").toLowerCase();
  const now = Date.now();
  
  if (server.inConversation && (now - server.lastResponseTime < 15000)) {
    return true;
  }
  
  for (const trigger of botTriggers) {
    if (combinedText.includes(trigger)) {
      return true;
    }
  }
  
  if (combinedText.includes("?")) {
    return true;
  }
  
  return false;
}

async function processMessageQueue(guildId: string) {
  const server = serverConnections.get(guildId);
  if (!server || server.messageQueue.length === 0 || server.isProcessing) return;
  
  const messages = [...server.messageQueue];
  server.messageQueue = [];
  
  if (!shouldRespond(guildId, messages)) {
    log.info({ guildId }, "Not responding - not addressed to bot");
    return;
  }
  
  server.isProcessing = true;
  
  const combinedInput = messages.map(m => m.text).join(". ");
  log.info({ guildId, combinedInput }, "Processing combined messages");
  
  try {
    const answer = await getAnswer(combinedInput, guildId);
    if (answer) {
      await speak(guildId, answer);
      server.lastResponseTime = Date.now();
      server.inConversation = true;
    }
  } catch (error) {
    log.error({ guildId, error }, "Error processing response");
  }
  
  server.isProcessing = false;
}

async function captureUser(guildId: string, userId: string, receiver: any) {
  const server = serverConnections.get(guildId);
  if (!server) return;
  
  const opusStream = receiver.subscribe(userId, {
    end: { behavior: EndBehaviorType.AfterSilence, duration: 1500 },
  });

  const decoder = new Prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
  const pcmChunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      decoder.end();
      resolve();
    }, 10000);
    
    opusStream.pipe(decoder);
    decoder.on("data", (chunk: Buffer) => pcmChunks.push(chunk));
    decoder.once("end", () => {
      clearTimeout(timeout);
      resolve();
    });
    decoder.once("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  if (pcmChunks.length === 0) return;

  const wav = pcmToWav(Buffer.concat(pcmChunks));
  const tmpPath = `./tmp_${guildId}_${Date.now()}.wav`;
  
  try {
    await fsProm.writeFile(tmpPath, wav);
    
    const transcript = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: fsCreateReadStream(tmpPath),
    });

    await fsProm.unlink(tmpPath);

    const text = (transcript.text || "").trim();
    if (!text || text.length < 3) return;
    
    // Filter out gibberish
    const specialChars = (text.match(/[δ∞¥₧]/g) || []).length;
    if (specialChars > 2) {
      log.info({ guildId, userId, text }, "Filtered out gibberish");
      return;
    }
    
    log.info({ guildId, userId, text }, "Heard");
    
    server.messageQueue.push({ userId, text });
    
    if (server.queueTimer) {
      clearTimeout(server.queueTimer);
    }
    
    // Wait 2 seconds after last message
    server.queueTimer = setTimeout(() => {
      processMessageQueue(guildId);
    }, 2000);
    
  } catch (error) {
    log.error(error, "transcription error");
    try {
      await fsProm.unlink(tmpPath);
    } catch {}
  }
}

// Conversation histories per server
const conversationHistories = new Map<string, Array<{role: "user" | "assistant" | "system", content: string}>>();

function getServerHistory(guildId: string) {
  if (!conversationHistories.has(guildId)) {
    conversationHistories.set(guildId, [
      { 
        role: "system", 
        content: "You're a 25 year old guy. You know sports (NFL, NCAA) and games (League, CoD, Siege). If someone talks shit, you'll roast them back but keep it funny. One sentence only, talk normal, don't try too hard."
      }
    ]);
  }
  return conversationHistories.get(guildId)!;
}

async function getAnswer(text: string, guildId: string): Promise<string> {
  const history = getServerHistory(guildId);
  
  history.push({ role: "user", content: text });
  
  while (history.length > 10) {
    history.splice(1, 1);
  }

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: history,
    max_tokens: 60,
    temperature: 0.9,
  });
  
  const answer = res.choices[0]?.message?.content?.trim() || "";
  
  if (answer) {
    history.push({ role: "assistant", content: answer });
  }
  
  return answer;
}

async function speak(guildId: string, text: string) {
  const server = serverConnections.get(guildId);
  if (!server) return;
  
  try {
    const res = await openai.audio.speech.create({
      model: "tts-1",
      voice: "onyx",
      input: text,
      speed: 1.0,
    });
    
    const buffer = Buffer.from(await res.arrayBuffer());
    const resource = createAudioResource(Readable.from(buffer), { inputType: StreamType.Arbitrary });
    server.player.play(resource);
  } catch (error) {
    log.error(error, "TTS error");
  }
}

client.login(process.env.DISCORD_BOT_TOKEN);

const app = express();
app.use(express.json());
app.get("/ping", (_req, res) => res.send("ok"));
app.listen(4000, "0.0.0.0", () => log.info("Webhook listening on 4000"));

// Handle native module crashes
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  if (error.message.includes('missing symbol')) {
    console.error('Native module issue detected. Try rebuilding with: pnpm rebuild');
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
