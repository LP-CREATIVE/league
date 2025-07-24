import OpenAI from "openai";

export async function tts(text: string, voice = "alloy") {
  const apiKey = process.env.OPENAI_API_KEY!;
  const openai = new OpenAI({ apiKey });

  const res = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice,
    input: text,
    format: "wav"
  });

  return Buffer.from(await res.arrayBuffer());
}
