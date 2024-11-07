class AudioProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0];
    const channelData = input[0];
    
    if (channelData) {
      // Convert Float32Array to Int16Array for Speechmatics
      const audio = new Int16Array(channelData.length);
      for (let i = 0; i < channelData.length; i++) {
        audio[i] = Math.max(-32768, Math.min(32767, channelData[i] * 32768));
      }
      
      this.port.postMessage(audio);
    }
    
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
