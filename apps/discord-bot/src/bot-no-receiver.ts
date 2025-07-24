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

client.login(process.env.DISCORD_BOT_TOKEN);

const app = express();
app.use(express.json());

app.get("/ping", (_req, res) => res.send("ok"));

app.post("/speak", async (req, res) => {
  try {
    const { text, guildId } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: "Missing text" });
    }
    
    // If no guildId specified, speak in all connected servers
    if (!guildId) {
      for (const [id, _] of serverConnections) {
        await speak(id, text);
      }
    } else {
      await speak(guildId, text);
    }
    
    res.json({ ok: true });
  } catch (e: any) {
    log.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(4000, "0.0.0.0", () => log.info("Webhook listening on 4000"));
