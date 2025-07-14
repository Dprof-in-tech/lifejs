import { createClient } from "@deepgram/sdk";
import { z } from "zod";
import { TTSBase, type TTSGenerateJob } from "../base";

/**
 * Configuration schema for Deepgram TTS provider.
 * Defines the available options for configuring Deepgram's text-to-speech service.
 */
export const deepgramTTSConfigSchema = z.object({
  apiKey: z.string().default(process.env.DEEPGRAM_API_KEY ?? ""),
  model: z.string().default("aura-asteria-en"),
  encoding: z.enum(["linear16", "mulaw", "alaw", "mp3", "opus", "flac"]).default("linear16"),
  sampleRate: z.enum(['8000', '16000', '24000', '32000', '48000']).default('16000'),
  bitRate: z.number().optional(),
  container: z.enum(["wav", "ogg", "none"]).default("none"),
}); 

/**
 * Deepgram TTS provider using the official Deepgram SDK for streaming text-to-speech synthesis.
 * Supports various audio formats and models available through Deepgram's API.
 */
export class DeepgramTTS extends TTSBase<typeof deepgramTTSConfigSchema> {
  private deepgram: ReturnType<typeof createClient>;

  /**
   * Create a new Deepgram TTS provider instance.
   * @param config - Configuration object with API key and optional settings
   * @throws Error if DEEPGRAM_API_KEY is not provided
   */
  constructor(config: z.input<typeof deepgramTTSConfigSchema>) {
    super(deepgramTTSConfigSchema, config);
    if (!this.config.apiKey) {
      throw new Error(
        "DEEPGRAM_API_KEY environment variable or config.apiKey must be provided to use this model."
      );
    }
    this.deepgram = createClient(this.config.apiKey);
  }

  /**
   * Create a new TTS generation job.
   * @returns Promise resolving to a TTSGenerateJob for streaming audio generation
   */
  async generate(): Promise<TTSGenerateJob> {
    return this.createGenerateJob();
  }

  /**
   * Handle text input for TTS synthesis using Deepgram's SDK.
   * @param job - The TTS generation job
   * @param text - Text to be synthesized
   * @param isLast - Whether this is the last text chunk (for tracking purposes)
   * @protected
   */
  protected async _onGeneratePushText(job: TTSGenerateJob, text: string, isLast: boolean): Promise<void> {
    // Handle empty text
    if (!text || text.trim() === "") {
      job.raw.receiveChunk({ type: "error", error: "Empty text provided for TTS synthesis" });
      return;
    }

    try {
      // Build options for Deepgram SDK
      // Convert sampleRate to number if necessary.
      const options = {
        model: this.config.model,
        encoding: this.config.encoding,
        sample_rate: typeof this.config.sampleRate === "string" ? Number(this.config.sampleRate) : this.config.sampleRate,
        container: this.config.container,
        ...(this.config.bitRate && { bit_rate: this.config.bitRate }),
      };

      // Use the SDK's speak method
      // Fix: Deepgram expects sample_rate as a number, but config.sampleRate may be a string.

      const response = await this.deepgram.speak.request(
        { text },
        options
      );

      // Handle the response based on Deepgram SDK documentation
      // Handle the response based on Deepgram SDK documentation
      if (response && typeof response.getStream === 'function') {
        const stream = await response.getStream();
        await this.processStream(job, stream);
      } else {
        job.raw.receiveChunk({ type: "error", error: "Invalid response format from Deepgram" });
        return;
      }

      job.raw.receiveChunk({ type: "end" });
    } catch (err: any) {
      if (err.name === "AbortError" || job.raw.abortController.signal.aborted) return;
      
      // Parse Deepgram error messages
      let errorMsg = err.message || "Unknown error occurred";
      try {
        if (err.response && err.response.data) {
          const errorData = typeof err.response.data === 'string' ? JSON.parse(err.response.data) : err.response.data;
          errorMsg = errorData.err_msg || errorData.message || errorMsg;
        }
      } catch (parseErr) {
        // If we can't parse the error, use the original message
      }
      
      job.raw.receiveChunk({ type: "error", error: errorMsg });
    }
  }

  /**
   * Process a stream of audio data from Deepgram
   */
  private async processStream(job: TTSGenerateJob, stream: ReadableStream): Promise<void> {
    const reader = stream.getReader();

    while (true) {
      if (job.raw.abortController.signal.aborted) break;
      
      const { done, value } = await reader.read();
      if (done) break;

      if (value) {
        // value is a Uint8Array; convert to Int16Array for PCM
        // Create a properly aligned buffer to avoid alignment issues
        const arrayBuffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.length);
        const pcmBytes = new Int16Array(arrayBuffer);
        job.raw.receiveChunk({ type: "content", voiceChunk: pcmBytes });
      }
    }
  }

  /**
   * Process a buffer of audio data from Deepgram
   */
  private processBuffer(job: TTSGenerateJob, buffer: ArrayBuffer): void {
    const arrayBuffer = buffer.slice(0);
    const pcmBytes = new Int16Array(arrayBuffer);
    job.raw.receiveChunk({ type: "content", voiceChunk: pcmBytes });
  }
}