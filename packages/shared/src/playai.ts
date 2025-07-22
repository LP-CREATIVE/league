export async function ttsPlayAI(text: string) {
  const apiKey = process.env.PLAYHT_API_KEY!;
  const userId = process.env.PLAYHT_USER_ID!;
  if (!apiKey || !userId) throw new Error("PLAYHT creds missing");

  const res = await fetch("https://api.play.ht/api/v2/tts", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "X-USER-ID": userId,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text,
      voice: process.env.PLAYAI_VOICE_ID || "s3://voice-clone-bucket/voices/default.json",
      output_format: "mp3"
    })
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`PlayHT TTS failed: ${res.status} ${msg}`);
  }

  const data = await res.json();
  const audioUrl = data.audioUrl || data.url;
  const audioBuf = await (await fetch(audioUrl)).arrayBuffer();
  return Buffer.from(audioBuf);
}
