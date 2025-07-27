const fs = require('fs');

// Read the current file
let content = fs.readFileSync('src/index.ts', 'utf8');

// Find the postToBot function
const startPattern = /async function postToBot\(text: string\) \{/;
const functionStart = content.search(startPattern);

if (functionStart === -1) {
  console.log("Could not find postToBot function!");
  process.exit(1);
}

// Find the end of the function by counting braces
let braceCount = 0;
let i = functionStart;
let functionEnd = -1;

while (i < content.length) {
  if (content[i] === '{') braceCount++;
  if (content[i] === '}') {
    braceCount--;
    if (braceCount === 0) {
      functionEnd = i + 1;
      break;
    }
  }
  i++;
}

// New postToBot function
const newFunction = `async function postToBot(text: string) {
  log.info({ textLength: text.length, preview: text.substring(0, 50) }, "postToBot called");

  // TTS-optimized chunking
  const maxLength = 450; // Discord TTS works best under 500 chars
  const messages = [];

  // Split by paragraphs first
  const paragraphs = text.split(/\\n\\n+/);
  
  for (const paragraph of paragraphs) {
    if (paragraph.trim().length === 0) continue;
    
    if (paragraph.length <= maxLength) {
      messages.push(paragraph.trim());
    } else {
      // Split long paragraphs by sentences
      const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
      let currentChunk = "";
      
      for (const sentence of sentences) {
        const trimmedSentence = sentence.trim();
        
        if (currentChunk.length + trimmedSentence.length + 1 > maxLength) {
          if (currentChunk) {
            messages.push(currentChunk.trim());
          }
          currentChunk = trimmedSentence;
        } else {
          currentChunk += (currentChunk ? " " : "") + trimmedSentence;
        }
      }
      
      if (currentChunk) {
        messages.push(currentChunk.trim());
      }
    }
  }

  log.info({ messageCount: messages.length }, "Sending messages to Discord");

  // Send each message with delay for TTS
  for (let i = 0; i < messages.length; i++) {
    try {
      const response = await fetch(process.env.DISCORD_BOT_WEBHOOK || "http://localhost:4000/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: messages[i] })
      });

      log.info({
        messageIndex: i,
        messageLength: messages[i].length,
        status: response.status
      }, "Discord bot response");

      if (!response.ok) {
        const errorText = await response.text();
        log.error({ status: response.status, error: errorText }, "Discord bot error");
      }
    } catch (e) {
      log.error(e, "Failed to send to Discord bot");
    }

    // Longer delay between messages for TTS to finish
    if (i < messages.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 3500));
    }
  }
}`;

// Replace the function
const newContent = content.substring(0, functionStart) + newFunction + content.substring(functionEnd);

// Write back
fs.writeFileSync('src/index.ts', newContent, 'utf8');

console.log("Successfully updated postToBot function!");
console.log("Changes:");
console.log("- Increased max length from 200 to 450 characters");
console.log("- Added smart sentence-based splitting");
console.log("- Increased delay between messages to 3.5 seconds");