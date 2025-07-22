import "dotenv/config";
import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } from "@discordjs/voice";
import express from "express";
import pino from "pino";
import { ttsPlayAI } from "@league/shared/playai.js";

const log = pino({ level: "info" });
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

let player = createAudioPlayer();
let ready = false;

client.once("ready", async () => {
  const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID!);
  const channel = guild.channels.cache.get(process.env.DISCORD_VOICE_CHANNEL_ID!) as any;
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator
  });
  connection.subscribe(player);
  ready = true;
  log.info("Discord voice bot ready");
});

client.login(process.env.DISCORD_BOT_TOKEN);

const app = express();
app.use(express.json());

app.post("/speak", async (req, res) => {
  try {
    if (!ready) throw new Error("bot not ready");
    const text: string = req.body.text || "";
    if (!text) throw new Error("no text");

    const buf = await ttsPlayAI(text);
    const resource = createAudioResource(Buffer.from(buf));
    player.play(resource);

    player.once(AudioPlayerStatus.Idle, () => {
      log.info("Finished speaking");
    });

    res.json({ ok: true });
  } catch (e: any) {
    log.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(4000, () => log.info("Webhook listening on 4000"));
