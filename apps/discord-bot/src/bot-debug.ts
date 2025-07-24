import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });
import { Client, GatewayIntentBits, ChannelType, VoiceChannel } from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  VoiceConnectionStatus,
  entersState
} from "@discordjs/voice";
import pino from "pino";

const log = pino({ level: "info" });
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ],
});

client.once("ready", async () => {
  log.info("Bot is ready!");
  
  try {
    // Test audio player creation
    log.info("Creating audio player...");
    const player = createAudioPlayer();
    log.info("Audio player created successfully");
    
    // Get first server config
    const guildId = process.env.DISCORD_GUILD_ID_1!;
    const channelId = process.env.DISCORD_VOICE_CHANNEL_ID_1!;
    
    log.info("Fetching guild...");
    const guild = await client.guilds.fetch(guildId);
    log.info("Guild fetched");
    
    log.info("Fetching channel...");
    const channel = await guild.channels.fetch(channelId);
    log.info("Channel fetched");
    
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      throw new Error("Not a voice channel");
    }
    
    const vc = channel as VoiceChannel;
    
    log.info("Attempting to join voice channel...");
    const connection = joinVoiceChannel({
      channelId: vc.id,
      guildId: vc.guild.id,
      adapterCreator: vc.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });
    
    log.info("Voice connection created, waiting for ready state...");
    await entersState(connection, VoiceConnectionStatus.Ready, 5000);
    log.info("Successfully connected to voice channel!");
    
    // Test subscribing player
    log.info("Subscribing player to connection...");
    connection.subscribe(player);
    log.info("Player subscribed successfully!");
    
    // Don't set up receiver yet
    log.info("Bot fully operational without voice receiver");
    
  } catch (error) {
    log.error(error, "Error during setup");
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
