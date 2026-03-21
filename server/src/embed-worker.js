import workerpool from 'workerpool';
import { pipeline } from '@huggingface/transformers';

let pipe = null;

async function getExtractor() {
  if (!pipe) {
    pipe = await pipeline('feature-extraction', 'BAAI/bge-small-en-v1.5');
  }
  return pipe;
}

async function generateEmbedding(text) {
  const embed = await getExtractor();
  const output = await embed(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

workerpool.worker({ generateEmbedding });
