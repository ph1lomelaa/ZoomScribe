class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunks = [];
    this.length = 0;
    this.targetLength = 2048;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    output.forEach((channel) => channel.fill(0));
    if (!input || !input.length || !input[0]?.length) return true;

    const size = input[0].length;
    const mono = new Float32Array(size);
    for (let channel = 0; channel < input.length; channel++) {
      const samples = input[channel];
      for (let index = 0; index < size; index++) mono[index] += samples[index] / input.length;
    }
    this.chunks.push(mono);
    this.length += size;

    if (this.length >= this.targetLength) {
      const merged = new Float32Array(this.length);
      let offset = 0;
      this.chunks.forEach((chunk) => { merged.set(chunk, offset); offset += chunk.length; });
      this.port.postMessage(merged, [merged.buffer]);
      this.chunks = [];
      this.length = 0;
    }
    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
