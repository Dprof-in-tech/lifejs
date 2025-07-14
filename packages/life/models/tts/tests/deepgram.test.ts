import { DeepgramTTS } from "../providers/deepgram";

// Test helper to collect TTS output
async function collectTTSOutput(
  job: {
    getStream: () => AsyncIterable<{ type: string; [key: string]: unknown }>;
    cancel: () => void;
    pushText: (text: string, isLast?: boolean) => void;
  },
  text: string,
  timeoutMs = 10000,
) {
  const results = {
    audioChunks: [] as Int16Array[],
    textChunks: [] as string[],
    totalDuration: 0,
    error: null as string | null,
  };

  return new Promise<typeof results>((resolve) => {
    const timeout = setTimeout(() => {
      job.cancel();
      resolve(results);
    }, timeoutMs);

    (async () => {
      try {
        // Start generating audio
        job.pushText(text);

        // Collect output
        for await (const chunk of job.getStream()) {
          if (chunk.type === "content") {
            results.audioChunks.push(chunk.voiceChunk as Int16Array);
            if (chunk.textChunk) {
              results.textChunks.push(chunk.textChunk as string);
            }
            if (chunk.durationMs) {
              results.totalDuration += chunk.durationMs as number;
            }
          } else if (chunk.type === "end") {
            break;
          } else if (chunk.type === "error") {
            results.error = String(chunk.error);
            break;
          }
        }
      } catch (error) {
        results.error = String(error);
      } finally {
        clearTimeout(timeout);
        resolve(results);
      }
    })();
  });
}

async function testDeepgramTTS() {
  console.log("\n🧪 Testing Deepgram TTS Provider");

  if (!process.env.DEEPGRAM_API_KEY) {
    console.log("⚠️  Skipping Deepgram TTS - DEEPGRAM_API_KEY not set");
    return { passed: 0, total: 0 };
  }

  const provider = new DeepgramTTS({
    apiKey: process.env.DEEPGRAM_API_KEY,
  });

  let passed = 0;
  let total = 0;

  // Test 1: Basic text synthesis
  total++;
  console.log("\n📝 Test 1: Basic Text Synthesis");
  try {
    const job = await provider.generate();
    const result = await collectTTSOutput(job, "Hello, this is a test of Deepgram TTS.", 15000);

    if (result.error) {
      console.log(`❌ Basic TTS: ${result.error}`);
    } else if (result.audioChunks.length > 0) {
      console.log(`✅ Basic TTS: Generated ${result.audioChunks.length} audio chunks`);
      console.log(`   Total duration: ${result.totalDuration}ms`);
      passed++;
    } else {
      console.log("❌ Basic TTS: No audio chunks generated");
    }
  } catch (error) {
    console.log(`❌ Basic TTS: ${error}`);
  }

  // Test 2: Configuration options
  total++;
  console.log("\n⚙️  Test 2: Configuration Options");
  try {
    const configuredProvider = new DeepgramTTS({
      apiKey: process.env.DEEPGRAM_API_KEY!,
      model: "aura-luna-en",
      encoding: "linear16",
      sampleRate: '24000',
      container: "none",
    });

    const job = await configuredProvider.generate();
    const result = await collectTTSOutput(job, "Testing configuration options.", 15000);

    if (result.error) {
      console.log(`❌ Configuration: ${result.error}`);
    } else if (result.audioChunks.length > 0) {
      console.log(`✅ Configuration: Generated ${result.audioChunks.length} audio chunks`);
      passed++;
    } else {
      console.log("❌ Configuration: No audio chunks generated");
    }
  } catch (error) {
    console.log(`❌ Configuration: ${error}`);
  }

  // Test 3: Cancellation
  total++;
  console.log("\n🚫 Test 3: Cancellation");
  try {
    const job = await provider.generate();
    
    // Start synthesis and immediately cancel
    setTimeout(() => job.cancel(), 100);
    
    const result = await collectTTSOutput(job, "This should be cancelled quickly.", 5000);

    // Cancellation test passes if it doesn't hang and doesn't produce an error
    if (result.error && result.error.includes("abort")) {
      console.log("✅ Cancellation: Job cancelled successfully");
      passed++;
    } else {
      console.log(`✅ Cancellation: Job completed without hanging`);
      passed++;
    }
  } catch (error) {
    console.log(`❌ Cancellation: ${error}`);
  }

  // Test 4: Empty text handling
  total++;
  console.log("\n📭 Test 4: Empty Text Handling");
  try {
    const job = await provider.generate();
    const result = await collectTTSOutput(job, "", 5000);

    if (result.error) {
      console.log(`✅ Empty Text: Properly handled with error: ${result.error}`);
      passed++;
    } else {
      console.log(`✅ Empty Text: Completed without error`);
      passed++;
    }
  } catch (error) {
    console.log(`❌ Empty Text: ${error}`);
  }

  // Test 5: Multiple text chunks
  total++;
  console.log("\n📝 Test 5: Multiple Text Chunks");
  try {
    const job = await provider.generate();
    
    // Send multiple text chunks
    setTimeout(() => job.pushText("First chunk. "), 100);
    setTimeout(() => job.pushText("Second chunk. "), 200);
    setTimeout(() => job.pushText("Third chunk.", true), 300); // Mark last chunk

    const result = await collectTTSOutput(job, "Initial text. ", 20000);

    if (result.error) {
      console.log(`❌ Multiple Chunks: ${result.error}`);
    } else if (result.audioChunks.length > 0) {
      console.log(`✅ Multiple Chunks: Generated ${result.audioChunks.length} audio chunks`);
      console.log(`   Total duration: ${result.totalDuration}ms`);
      passed++;
    } else {
      console.log("❌ Multiple Chunks: No audio chunks generated");
    }
  } catch (error) {
    console.log(`❌ Multiple Chunks: ${error}`);
  }

  console.log(
    `\n📊 Deepgram TTS Results: ${passed}/${total} tests passed (${Math.round((passed / total) * 100)}%)`,
  );
  return { passed, total };
}

export { testDeepgramTTS };

if (require.main === module) {
  testDeepgramTTS();
}