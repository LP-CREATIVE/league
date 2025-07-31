import "dotenv/config";
import fetch from "node-fetch";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration - same as harvester
const CONFIG = {
  DISCORD_WEBHOOK: process.env.DISCORD_BOT_WEBHOOK || "http://localhost:4000/speak",
  MAX_MESSAGE_LENGTH: 1000, // Same chunk size as harvester
  DEBUG: true
};

// Debug logger - same as harvester
function debug(message: string, data?: any) {
  if (CONFIG.DEBUG) {
    console.log(`[${new Date().toISOString()}] ${message}`);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

// Format analysis for Discord TTS - exact same logic as harvester
function formatForDiscord(analysis: string): string[] {
  debug("Formatting analysis for Discord", { totalLength: analysis.length });
  
  const messages: string[] = [];
  
  // Split by major sections (double newlines)
  const majorSections = analysis.split(/\n\n+/);
  
  for (const section of majorSections) {
    if (!section.trim()) continue;
    
    // Check if this is a header line (all caps or contains "PHASE" or "WIN CONDITIONS")
    const isHeader = section === section.toUpperCase() || 
                    section.includes("PHASE") || 
                    section.includes("WIN CONDITIONS") ||
                    section.includes("MATCHUP ANALYSIS");
    
    if (isHeader || section.length <= CONFIG.MAX_MESSAGE_LENGTH) {
      messages.push(section.trim());
    } else {
      // Split by lines first
      const lines = section.split('\n');
      let currentMessage = '';
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        
        // Check if adding this line would exceed limit
        const potentialMessage = currentMessage ? `${currentMessage} ${trimmedLine}` : trimmedLine;
        
        if (potentialMessage.length > CONFIG.MAX_MESSAGE_LENGTH) {
          // Send current message if it exists
          if (currentMessage) {
            messages.push(currentMessage);
            currentMessage = '';
          }
          
          // If the line itself is too long, split by sentences
          if (trimmedLine.length > CONFIG.MAX_MESSAGE_LENGTH) {
            const sentences = trimmedLine.match(/[^.!?]+[.!?]+/g) || [trimmedLine];
            
            for (const sentence of sentences) {
              const trimmedSentence = sentence.trim();
              
              if (currentMessage && (currentMessage + ' ' + trimmedSentence).length > CONFIG.MAX_MESSAGE_LENGTH) {
                messages.push(currentMessage);
                currentMessage = trimmedSentence;
              } else {
                currentMessage = currentMessage ? `${currentMessage} ${trimmedSentence}` : trimmedSentence;
              }
            }
          } else {
            currentMessage = trimmedLine;
          }
        } else {
          currentMessage = potentialMessage;
        }
      }
      
      // Add any remaining content
      if (currentMessage) {
        messages.push(currentMessage);
      }
    }
  }
  
  debug(`Split into ${messages.length} messages`);
  
  if (CONFIG.DEBUG) {
    console.log("\n=== MESSAGE BREAKDOWN ===");
    messages.forEach((msg, i) => {
      console.log(`\nMessage ${i + 1} (${msg.length} chars):`);
      console.log(`"${msg}"`);
    });
    console.log("=== END MESSAGE BREAKDOWN ===\n");
  }
  
  return messages;
}

// Send message to Discord bot - same as harvester with waitForCompletion: true
async function sendToDiscord(message: string, waitForCompletion: boolean = true): Promise<void> {
  debug(`Sending to Discord: "${message.substring(0, 50)}..."`, {
    fullLength: message.length,
    waitForCompletion
  });
  
  try {
    const response = await fetch(CONFIG.DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message, waitForCompletion })
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error({ status: response.status, error }, "Discord webhook failed");
      debug("Discord webhook error", { status: response.status, error });
    } else {
      debug("Successfully sent to Discord");
    }
  } catch (error) {
    console.error(error, "Failed to send to Discord");
    debug("Exception sending to Discord", error);
  }
}

// Main test function
async function testDiscordBot() {
  console.log("=================================");
  console.log("Discord Bot Test - Simulating Harvester");
  console.log("=================================");
  console.log(`Webhook: ${CONFIG.DISCORD_WEBHOOK}`);
  console.log(`Message chunk size: ${CONFIG.MAX_MESSAGE_LENGTH} chars`);
  console.log("Messages wait for completion: YES");
  console.log("=================================\n");
  
  try {
    // Read the test analysis file
    const analysisPath = path.join(__dirname, "test_jungle_analysis.txt");
    const analysis = await fs.readFile(analysisPath, "utf-8");
    
    console.log("📖 Loaded test analysis");
    console.log(`Total length: ${analysis.length} characters`);
    
    // Send initial message
    console.log("\n🎮 Simulating game detection...");
    await sendToDiscord("Game detected. Analyzing jungle matchup...");
    
    // Format and send the analysis
    const messages = formatForDiscord(analysis);
    
    console.log(`\n📨 SENDING ${messages.length} MESSAGES TO DISCORD 📨`);
    
    for (let i = 0; i < messages.length; i++) {
      console.log(`\n[${i + 1}/${messages.length}] Sending message...`);
      console.log(`Length: ${messages[i].length} chars`);
      console.log(`Preview: "${messages[i].substring(0, 100)}..."`);
      
      // Wait for each message to complete before sending the next
      await sendToDiscord(messages[i], true);
      console.log(`✓ Message ${i + 1} completed`);
    }
    
    console.log("\n✅ ALL MESSAGES SENT SUCCESSFULLY! ✅\n");
    console.log("Test completed! Check your Discord voice channel.");
    
  } catch (error) {
    console.error("\n❌ ERROR DURING TEST ❌");
    console.error(error);
  }
}

// Run the test
testDiscordBot().catch(err => {
  console.error("❌ FATAL ERROR ❌");
  console.error(err);
  process.exit(1);
});