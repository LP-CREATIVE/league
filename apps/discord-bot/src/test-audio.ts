import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });
import { createAudioPlayer, createAudioResource, StreamType, AudioPlayerStatus } from "@discordjs/voice";
import { Client, GatewayIntentBits } from "discord.js";
import { joinVoiceChannel } from "@discordjs/voice";
import { createReadStream } from "fs";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

client.once("ready", async () => {
  console.log("Bot ready!");
  
  try {
    const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID_1!);
    const channel = await guild.channels.fetch(process.env.DISCORD_VOICE_CHANNEL_ID_1!);
    
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
    });
    
    const player = createAudioPlayer();
    connection.subscribe(player);
    
    player.on(AudioPlayerStatus.Playing, () => console.log("Started playing"));
    player.on(AudioPlayerStatus.Idle, () => console.log("Finished playing"));
    player.on("error", error => console.error("Player error:", error));
    
    // Try to play an actual audio file if exists
    console.log("Attempting to play audio...");
    
    // Create a simple beep sound
    const resource = createAudioResource("https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3");
    player.play(resource);
    
  } catch (error) {
    console.error("Error:", error);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);