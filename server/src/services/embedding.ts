import workerpool from 'workerpool';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NUM_WORKERS = parseInt(process.env.EMBED_WORKERS || '4', 10);

const pool = workerpool.pool(path.resolve(__dirname, '../embed-worker.js'), {
    maxWorkers: NUM_WORKERS,
    workerType: 'thread',
});

export async function generateEmbedding(text: string): Promise<number[]> {
    return pool.exec('generateEmbedding', [text]);
}

export async function terminateWorker(): Promise<void> {
    await pool.terminate();
}
