const { createAudioPlayer } = require('@discordjs/voice');

console.log('Creating audio player...');
try {
  const player = createAudioPlayer();
  console.log('Audio player created successfully!');
  process.exit(0);
} catch (error) {
  console.error('Failed to create audio player:', error);
  process.exit(1);
}
