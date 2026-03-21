import { parentPort } from 'node:worker_threads';
import { pipeline } from '@huggingface/transformers';

let pipe = null;

async function getExtractor() {
  if (!pipe) {
    pipe = await pipeline('feature-extraction', 'BAAI/bge-small-en-v1.5');
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