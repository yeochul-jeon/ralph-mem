import { describe, expect, it } from "vitest";
import {
	bufferToEmbedding,
	cosineSimilarity,
	createMockEmbeddingService,
	embeddingToBuffer,
} from "../../src/core/embedding";

describe("Embedding Service", () => {
	describe("cosineSimilarity", () => {
		it("should return 1 for identical vectors", () => {
			const a = [1, 0, 0];
			const b = [1, 0, 0];

			expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
		});

		it("should return 0 for orthogonal vectors", () => {
			const a = [1, 0, 0];
			const b = [0, 1, 0];

			expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
		});

		it("should return -1 for opposite vectors", () => {
			const a = [1, 0, 0];
			const b = [-1, 0, 0];

			expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
		});

		it("should handle normalized vectors", () => {
			const a = [0.6, 0.8, 0];
			const b = [0.8, 0.6, 0];

			const similarity = cosineSimilarity(a, b);
			expect(similarity).toBeGreaterThan(0.9); // Similar directions
			expect(similarity).toBeLessThan(1);
		});

		it("should throw for different length vectors", () => {
			const a = [1, 0, 0];
			const b = [1, 0];

			expect(() => cosineSimilarity(a, b)).toThrow("same length");
		});

		it("should handle zero vectors", () => {
			const a = [0, 0, 0];
			const b = [1, 0, 0];

			expect(cosineSimilarity(a, b)).toBe(0);
		});
	});

	describe("embeddingToBuffer / bufferToEmbedding", () => {
		it("should convert embedding to buffer and back", () => {
			const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];

			const buffer = embeddingToBuffer(embedding);
			expect(buffer).toBeInstanceOf(Uint8Array);
			expect(buffer.length).toBe(embedding.length * 4); // Float32 = 4 bytes

			const restored = bufferToEmbedding(buffer);
			expect(restored.length).toBe(embedding.length);
			for (let i = 0; i < embedding.length; i++) {
				expect(restored[i]).toBeCloseTo(embedding[i], 5);
			}
		});

		it("should handle large embeddings", () => {
			const embedding = new Array(384).fill(0).map((_, i) => i / 384);

			const buffer = embeddingToBuffer(embedding);
			const restored = bufferToEmbedding(buffer);

			expect(restored.length).toBe(384);
			for (let i = 0; i < embedding.length; i++) {
				expect(restored[i]).toBeCloseTo(embedding[i], 5);
			}
		});

		it("should handle negative values", () => {
			const embedding = [-0.5, 0, 0.5];

			const buffer = embeddingToBuffer(embedding);
			const restored = bufferToEmbedding(buffer);

			expect(restored).toEqual(expect.arrayContaining([-0.5, 0, 0.5]));
		});
	});

	describe("MockEmbeddingService", () => {
		it("should create mock service", () => {
			const service = createMockEmbeddingService();

			expect(service.isReady()).toBe(true);
		});

		it("should encode text to 384-dimensional vector", async () => {
			const service = createMockEmbeddingService();

			const embedding = await service.encode("Hello world");

			expect(embedding.length).toBe(384);
			expect(embedding.every((v) => typeof v === "number")).toBe(true);
		});

		it("should encode Korean text", async () => {
			const service = createMockEmbeddingService();

			const embedding = await service.encode("안녕하세요");

			expect(embedding.length).toBe(384);
		});

		it("should return normalized vectors", async () => {
			const service = createMockEmbeddingService();

			const embedding = await service.encode("Test text");
			const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));

			expect(norm).toBeCloseTo(1, 3);
		});

		it("should encode batch of texts", async () => {
			const service = createMockEmbeddingService();

			const embeddings = await service.encodeBatch([
				"First text",
				"Second text",
				"Third text",
			]);

			expect(embeddings.length).toBe(3);
			expect(embeddings.every((e) => e.length === 384)).toBe(true);
		});

		it("should return empty array for empty batch", async () => {
			const service = createMockEmbeddingService();

			const embeddings = await service.encodeBatch([]);

			expect(embeddings).toEqual([]);
		});

		it("should give similar texts higher similarity", async () => {
			const service = createMockEmbeddingService();

			const similar1 = await service.encode("The cat sat on the mat");
			const similar2 = await service.encode("The cat sat on the mat");
			const different = await service.encode("xyz123abc456");

			const simSimilar = cosineSimilarity(similar1, similar2);
			const simDifferent = cosineSimilarity(similar1, different);

			// Identical texts should have similarity 1
			expect(simSimilar).toBeCloseTo(1, 5);
			// Different texts should have lower similarity
			expect(simDifferent).toBeLessThan(simSimilar);
		});
	});

	describe("Semantic Similarity (Mock)", () => {
		it("should differentiate similar vs different texts", async () => {
			const service = createMockEmbeddingService();

			// These use mock, so similarity is based on character overlap
			const text1 = "TypeScript error: Cannot find module";
			const text2 = "TypeScript error: Cannot find module 'lodash'";
			const text3 = "Python syntax error on line 42";

			const emb1 = await service.encode(text1);
			const emb2 = await service.encode(text2);
			const emb3 = await service.encode(text3);

			const sim12 = cosineSimilarity(emb1, emb2);
			const sim13 = cosineSimilarity(emb1, emb3);

			// Similar error messages should have higher similarity
			expect(sim12).toBeGreaterThan(sim13);
		});
	});

	// Note: Real model tests are slow and require downloading the model
	// They are marked with .skip to avoid running in CI
	// Run them manually with: bun test tests/core/embedding.test.ts -t "Real Model"
	describe.skip("Real Model (slow, requires model download)", () => {
		it("should load and encode English text", async () => {
			const { createEmbeddingService } = await import(
				"../../src/core/embedding"
			);
			const service = createEmbeddingService();

			await service.initialize();
			expect(service.isReady()).toBe(true);

			const embedding = await service.encode("Hello world");
			expect(embedding.length).toBe(384);
		});

		it("should encode Korean text", async () => {
			const { createEmbeddingService } = await import(
				"../../src/core/embedding"
			);
			const service = createEmbeddingService();

			const embedding = await service.encode("안녕하세요 세계");
			expect(embedding.length).toBe(384);
		});

		it("should give semantically similar texts high similarity", async () => {
			const { createEmbeddingService } = await import(
				"../../src/core/embedding"
			);
			const service = createEmbeddingService();

			const emb1 = await service.encode("The weather is nice today");
			const emb2 = await service.encode("It's a beautiful day outside");
			const emb3 = await service.encode("Database connection error");

			const simSimilar = cosineSimilarity(emb1, emb2);
			const simDifferent = cosineSimilarity(emb1, emb3);

			// Semantically similar texts should have higher similarity
			expect(simSimilar).toBeGreaterThan(0.5);
			expect(simDifferent).toBeLessThan(simSimilar);
		});

		it("should encode batch of texts", async () => {
			const { createEmbeddingService } = await import(
				"../../src/core/embedding"
			);
			const service = createEmbeddingService();

			const embeddings = await service.encodeBatch([
				"First text",
				"Second text",
				"Third text",
			]);

			expect(embeddings.length).toBe(3);
			expect(embeddings.every((e) => e.length === 384)).toBe(true);
		});
	});
});
