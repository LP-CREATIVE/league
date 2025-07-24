import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });
import OpenAI from "openai";

console.log("Testing OpenAI connection...");
console.log("API Key exists:", !!process.env.OPENAI_API_KEY);
console.log("API Key length:", process.env.OPENAI_API_KEY?.length);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

async function testOpenAI() {
  try {
    console.log("\n1. Testing Chat Completion...");
    const chatResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Say hello in 5 words" }],
      max_tokens: 20,
    });
    console.log("Chat response:", chatResponse.choices[0]?.message?.content);
    
    console.log("\n2. Testing TTS...");
    const ttsResponse = await openai.audio.speech.create({
      model: "tts-1",
      voice: "onyx",
      input: "Testing text to speech",
    });
    console.log("TTS response received, size:", (await ttsResponse.arrayBuffer()).byteLength, "bytes");
    
    console.log("\n3. Testing available models...");
    const models = await openai.models.list();
    console.log("Available models:", models.data.slice(0, 5).map(m => m.id));
    
    console.log("\n✅ All OpenAI tests passed!");
    
  } catch (error: any) {
    console.error("\n❌ OpenAI Error:", error.message);
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", error.response.data);
    }
  }
}

testOpenAI();
