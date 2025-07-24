import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });
import { Client, GatewayIntentBits, ChannelType, VoiceChannel } from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  VoiceConnection,
  EndBehaviorType
} from "@discordjs/voice";
import Prism from "prism-media";
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
    const guildId = process.env.DISCORD_GUILD_ID_1!;
    const channelId = process.env.DISCORD_VOICE_CHANNEL_ID_1!;
    
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId) as VoiceChannel;
    
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });
    
    log.info("Connected to voice channel");
    
    const receiver = connection.receiver;
    log.info("Got receiver object");
    
    receiver.speaking.on("start", (userId: string) => {
      log.info({ userId }, "User started speaking");
      
      try {
        const opusStream = receiver.subscribe(userId, {
          end: { behavior: EndBehaviorType.AfterSilence, duration: 1000 },
        });
        
        log.info("Subscribed to user audio");
        
        const decoder = new Prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
        opusStream.pipe(decoder);
        
        decoder.on("data", (chunk) => {
          log.info(`Received audio chunk: ${chunk.length} bytes`);
        });
        
        decoder.on("end", () => {
          log.info("Audio stream ended");
        });
        
      } catch (error) {
        log.error(error, "Error in voice receiver");
      }
    });
    
    log.info("Voice receiver set up successfully");
    
  } catch (error) {
    log.error(error, "Setup error");
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
