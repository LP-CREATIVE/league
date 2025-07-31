import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });
import { Client, GatewayIntentBits, ChannelType, VoiceChannel } from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
  VoiceConnection,
} from "@discordjs/voice";
import express from "express";
import pino from "pino";
import { Readable } from "stream";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

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
  log.info("Voice RECEIVING is currently disabled on macOS due to native module issues");
  log.info("You can still use the /speak endpoint to make the bot talk");
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
    player
  });
  
  player.on("error", (e) => log.error({ guildId, error: e }, "Audio error"));
  player.on(AudioPlayerStatus.Playing, () => log.info("Playing"));
  player.on(AudioPlayerStatus.Idle, () => log.info("Finished"));
  
  // Voice receiver disabled for now - setupVoiceReceiver(guildId, connection);
  
  log.info({ guildId, channelId: voiceChannelId }, "Connected to voice channel");
}

async function speak(guildId: string, text: string) {
  const server = serverConnections.get(guildId);
  if (!server) {
    log.error(`Server ${guildId} not found`);
    return;
  }
  
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

// Add this new function to wait for speech completion
async function speakAndWait(guildId: string, text: string): Promise<void> {
  const server = serverConnections.get(guildId);
  if (!server) {
    log.error(`Server ${guildId} not found`);
    return;
  }
  
  try {
    const res = await openai.audio.speech.create({
      model: "tts-1",
      voice: "onyx",
      input: text,
      speed: 1.0,
    });
    
    const buffer = Buffer.from(await res.arrayBuffer());
    const resource = createAudioResource(Readable.from(buffer), { inputType: StreamType.Arbitrary });
    
    // Return a promise that resolves when speaking is done
    return new Promise((resolve) => {
      // Listen for when the player becomes idle (done speaking)
      const idleHandler = () => {
        server.player.off(AudioPlayerStatus.Idle, idleHandler);
        resolve();
      };
      
      server.player.on(AudioPlayerStatus.Idle, idleHandler);
      server.player.play(resource);
      
      // Timeout after 5 minutes in case something goes wrong
      setTimeout(() => {
        server.player.off(AudioPlayerStatus.Idle, idleHandler);
        resolve();
      }, 300000);
    });
  } catch (error) {
    log.error(error, "TTS error");
  }
}

client.login(process.env.DISCORD_BOT_TOKEN);

const app = express();
app.use(express.json());

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Stats tracking
const stats = {
  servers: 0,
  voiceConnections: 0,
  messagesProcessed: 0,
  startTime: Date.now()
};

app.get("/ping", (_req, res) => {
  stats.servers = client.guilds.cache.size;
  stats.voiceConnections = serverConnections.size;
  
  res.json({ 
    status: "ok",
    stats
  });
});

// Harvester status endpoint (placeholder for now)
app.get("/harvester-status", (_req, res) => {
  // This would be updated by the harvester service in production
  res.json({
    connected: true,
    leagueClientConnected: false,
    gamePhase: "-",
    analysisCount: stats.messagesProcessed
  });
});

app.post("/speak", async (req, res) => {
  try {
    const { text, guildId, waitForCompletion } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: "Missing text" });
    }
    
    // If no guildId specified, speak in all connected servers
    const targetGuilds = guildId ? [guildId] : Array.from(serverConnections.keys());
    
    if (waitForCompletion) {
      // Wait for speech to complete before responding
      for (const id of targetGuilds) {
        await speakAndWait(id, text);
      }
      res.json({ ok: true, completed: true });
    } else {
      // Original behavior - respond immediately
      for (const id of targetGuilds) {
        await speak(id, text);
      }
      res.json({ ok: true });
    }
    
    // Track messages processed
    stats.messagesProcessed++;
  } catch (e: any) {
    log.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(4000, "0.0.0.0", () => {
  log.info("Webhook listening on 4000");
  log.info("Web UI available at http://localhost:4000");
});
