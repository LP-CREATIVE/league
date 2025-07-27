 
import OpenAI from "openai";

export async function askGPT(prompt: string, model = "gpt-4o-mini") {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  const openai = new OpenAI({ apiKey });

  const res = await openai.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 1000,  // Increased from 120 to 1000 for detailed analysis
    temperature: 0.3
  });

  const choice = res.choices[0];
  return {
    text: choice.message?.content ?? "",
    tokens: res.usage?.total_tokens ?? 0,
    costUsd: ((res.usage?.total_tokens ?? 0) / 1000) * 0.002
  };
}