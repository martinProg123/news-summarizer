import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type workerMsg = { status: 'success' | 'error', vector?: number[], error?: string }

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const worker = new Worker(path.resolve(__dirname, '../embed-worker.js'));

export function generateEmbedding(text: string): Promise<number[]> {
    return new Promise((resolve, reject) => {
        worker.postMessage(text);

        const onMessage = (response: workerMsg) => {
            if (response.status === 'success' && response.vector) {
                resolve(response.vector);
            } else {
                reject(new Error(response.error || 'No vector returned'));
            }
            cleanup();
        };

        const onError = (err: string) => {
            reject(err);
            cleanup();
        };

        const cleanup = () => {
            worker.off('message', onMessage);
            worker.off('error', onError);
        };

        worker.on('message', onMessage);
        worker.on('error', onError);
    });
}
