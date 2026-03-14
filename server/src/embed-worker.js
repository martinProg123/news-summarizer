import { parentPort } from 'node:worker_threads';
import { pipeline } from '@huggingface/transformers';

let pipe = null;

// Lazy-load the model to save memory until needed
async function getExtractor() {
  if (!pipe) {
    pipe = await pipeline('feature-extraction', 'Qwen/Qwen3-Embedding-0.6B');
  }
  return pipe;
}

parentPort.on('message', async (text) => {
  try {
    const embed = await getExtractor();
    
    // Generate embedding
    const output = await embed(text, { pooling: 'mean', normalize: true });
    
    // Convert tensor to standard JS Array for pgvector
    const vector = Array.from(output.data);
    
    parentPort.postMessage({ status: 'success', vector });
  } catch (error) {
    parentPort.postMessage({ status: 'error', error: error.message });
  }
});