import Prism from 'prism-media';

console.log('Testing Prism media...');
try {
  const decoder = new Prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
  console.log('Opus decoder created successfully!');
} catch (error) {
  console.error('Failed to create opus decoder:', error);
}
