/**
 * Embedding Service
 *
 * Provides text-to-vector encoding using paraphrase-multilingual model.
 * Uses @xenova/transformers for local inference.
 *
 * See: docs/issues/021-embedding-service/README.md
 */

// Note: We use dynamic import to handle the ESM module
let pipeline: unknown = null;
let extractor: unknown = null;

/**
 * Embedding service interface
 */
export interface EmbeddingService {
	encode(text: string): Promise<number[]>;
	encodeBatch(texts: string[]): Promise<number[][]>;
	isReady(): boolean;
	initialize(): Promise<void>;
}

/**
 * Model configuration
 */
const MODEL_NAME = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
const EMBEDDING_DIM = 384;

/**
 * Load the transformers pipeline dynamically
 */
async function loadPipeline(): Promise<unknown> {
	if (pipeline) {
		return extractor;
	}

	// Dynamic import for ESM compatibility
	const { pipeline: createPipeline } = await import("@xenova/transformers");
	pipeline = createPipeline;

	// Create feature extraction pipeline
	extractor = await (pipeline as CallableFunction)(
		"feature-extraction",
		MODEL_NAME,
	);
	return extractor;
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length) {
		throw new Error("Vectors must have the same length");
	}

	let dotProduct = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < a.length; i++) {
		dotProduct += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}

	const denominator = Math.sqrt(normA) * Math.sqrt(normB);
	if (denominator === 0) return 0;

	return dotProduct / denominator;
}

/**
 * Convert embedding to buffer for storage
 */
export function embeddingToBuffer(embedding: number[]): Uint8Array {
	const buffer = new Float32Array(embedding);
	return new Uint8Array(buffer.buffer);
}

/**
 * Convert buffer back to embedding
 */
export function bufferToEmbedding(buffer: Uint8Array): number[] {
	const float32 = new Float32Array(buffer.buffer);
	return Array.from(float32);
}

/**
 * Create an embedding service instance
 */
export function createEmbeddingService(): EmbeddingService {
	let ready = false;
	let initPromise: Promise<void> | null = null;

	return {
		async initialize(): Promise<void> {
			if (ready) return;

			if (initPromise) {
				await initPromise;
				return;
			}

			initPromise = (async () => {
				await loadPipeline();
				ready = true;
			})();

			await initPromise;
		},

		isReady(): boolean {
			return ready;
		},

		async encode(text: string): Promise<number[]> {
			if (!ready) {
				await this.initialize();
			}

			const ext = extractor as CallableFunction;
			const output = await ext(text, {
				pooling: "mean",
				normalize: true,
			});

			// Extract the embedding from the tensor
			const embedding: number[] = Array.from(output.data as Float32Array);
			return embedding.slice(0, EMBEDDING_DIM);
		},

		async encodeBatch(texts: string[]): Promise<number[][]> {
			if (!ready) {
				await this.initialize();
			}

			if (texts.length === 0) {
				return [];
			}

			const ext = extractor as CallableFunction;
			const output = await ext(texts, {
				pooling: "mean",
				normalize: true,
			});

			// Extract embeddings from batch output
			const data = output.data as Float32Array;
			const embeddings: number[][] = [];

			for (let i = 0; i < texts.length; i++) {
				const start = i * EMBEDDING_DIM;
				const embedding = Array.from(data.slice(start, start + EMBEDDING_DIM));
				embeddings.push(embedding);
			}

			return embeddings;
		},
	};
}

/**
 * Create a mock embedding service for testing
 */
export function createMockEmbeddingService(): EmbeddingService {
	// Simple hash-based mock embedding
	function hashEmbed(text: string): number[] {
		const embedding = new Array(EMBEDDING_DIM).fill(0);
		for (let i = 0; i < text.length; i++) {
			const idx = i % EMBEDDING_DIM;
			embedding[idx] += text.charCodeAt(i) / 1000;
		}
		// Normalize
		const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0)) || 1;
		return embedding.map((v) => v / norm);
	}

	return {
		async initialize(): Promise<void> {
			// No-op for mock
		},

		isReady(): boolean {
			return true;
		},

		async encode(text: string): Promise<number[]> {
			return hashEmbed(text);
		},

		async encodeBatch(texts: string[]): Promise<number[][]> {
			return texts.map((text) => hashEmbed(text));
		},
	};
}

/**
 * Global singleton instance (lazy initialized)
 */
let globalService: EmbeddingService | null = null;

export function getEmbeddingService(): EmbeddingService {
	if (!globalService) {
		globalService = createEmbeddingService();
	}
	return globalService;
}

/**
 * Queue for background embedding generation
 */
interface EmbeddingTask {
	text: string;
	callback: (embedding: number[]) => void;
}

const embeddingQueue: EmbeddingTask[] = [];
let isProcessing = false;

/**
 * Queue a text for background embedding generation
 */
export function queueEmbedding(
	text: string,
	callback: (embedding: number[]) => void,
): void {
	embeddingQueue.push({ text, callback });

	if (!isProcessing) {
		processEmbeddingQueue();
	}
}

async function processEmbeddingQueue(): Promise<void> {
	if (isProcessing || embeddingQueue.length === 0) return;

	isProcessing = true;
	const service = getEmbeddingService();

	try {
		while (embeddingQueue.length > 0) {
			// Process in batches of 10
			const batch = embeddingQueue.splice(0, 10);
			const texts = batch.map((t) => t.text);
			const embeddings = await service.encodeBatch(texts);

			for (let i = 0; i < batch.length; i++) {
				try {
					batch[i].callback(embeddings[i]);
				} catch {
					// Ignore callback errors
				}
			}
		}
	} finally {
		isProcessing = false;
	}
}
