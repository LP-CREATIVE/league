export const config = {
  // Voice detection settings
  voice: {
    silenceDuration: 100, // ms - how long to wait after speech stops
    minAudioLength: 500, // ms - minimum audio length to process
    sampleRate: 48000,
    channels: 2,
    frameSize: 960,
  },
  
  // AI settings
  ai: {
    whisperModel: "whisper-1",
    chatModel: "gpt-4o-mini",
    ttsModel: "tts-1",
    ttsVoice: "nova", // nova, alloy, echo, fable, onyx, shimmer
    ttsSpeed: 1.1,
    maxTokens: 100,
    temperature: 0.9,
  },
  
  // Response settings
  quickResponses: {
    "hey": "Hey there! What's up?",
    "hello": "Hi! How can I help?",
    "thanks": "You're welcome!",
    "thank you": "No problem at all!",
    "bye": "See you later!",
    "goodbye": "Take care!",
  }
};
