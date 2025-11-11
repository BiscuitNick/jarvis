"use strict";
/**
 * AWS Transcribe Streaming Provider
 * Implements real-time speech-to-text using AWS Transcribe Streaming API
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AWSTranscribeProvider = void 0;
const client_transcribe_streaming_1 = require("@aws-sdk/client-transcribe-streaming");
class AWSTranscribeProvider {
    constructor(region = 'us-east-1') {
        this.isStreaming = false;
        this.client = new client_transcribe_streaming_1.TranscribeStreamingClient({ region });
    }
    async startStream(onTranscript, onError, config) {
        if (this.isStreaming) {
            throw new Error('Stream already active');
        }
        const languageCode = (config?.languageCode || 'en-US');
        const sampleRate = config?.sampleRate || 16000;
        try {
            // Create audio stream using ReadableStream
            const stream = new ReadableStream({
                start: (controller) => {
                    this.audioGeneratorController = controller;
                },
            });
            this.audioStream = stream;
            // Start transcription command
            const command = new client_transcribe_streaming_1.StartStreamTranscriptionCommand({
                LanguageCode: languageCode,
                MediaSampleRateHertz: sampleRate,
                MediaEncoding: client_transcribe_streaming_1.MediaEncoding.PCM,
                AudioStream: this.audioStream,
            });
            this.isStreaming = true;
            // Execute command and handle response stream
            const response = await this.client.send(command);
            if (!response.TranscriptResultStream) {
                throw new Error('No transcript result stream received');
            }
            // Process transcription results
            this.processTranscriptStream(response.TranscriptResultStream, onTranscript, onError);
        }
        catch (error) {
            this.isStreaming = false;
            onError(error);
        }
    }
    async processTranscriptStream(resultStream, onTranscript, onError) {
        try {
            for await (const event of resultStream) {
                if (event.TranscriptEvent) {
                    const results = event.TranscriptEvent.Transcript?.Results || [];
                    for (const result of results) {
                        if (!result.Alternatives || result.Alternatives.length === 0) {
                            continue;
                        }
                        const alternative = result.Alternatives[0];
                        const transcript = alternative.Transcript || '';
                        const isFinal = !result.IsPartial;
                        const confidence = alternative.Items?.[0]?.Confidence;
                        if (transcript) {
                            onTranscript({
                                transcript,
                                isFinal,
                                confidence,
                                timestamp: Date.now(),
                            });
                        }
                    }
                }
            }
        }
        catch (error) {
            onError(error);
        }
        finally {
            this.isStreaming = false;
        }
    }
    async sendAudio(audioChunk) {
        if (!this.isStreaming || !this.audioGeneratorController) {
            throw new Error('Stream not active');
        }
        // Create AudioEvent and enqueue it
        const audioEvent = {
            AudioChunk: new Uint8Array(audioChunk),
        };
        this.audioGeneratorController.enqueue(audioEvent);
    }
    async endStream() {
        if (!this.isStreaming) {
            return;
        }
        if (this.audioGeneratorController) {
            this.audioGeneratorController.close();
            this.audioGeneratorController = undefined;
        }
        this.audioStream = undefined;
        this.isStreaming = false;
    }
    getName() {
        return 'AWS Transcribe';
    }
}
exports.AWSTranscribeProvider = AWSTranscribeProvider;
//# sourceMappingURL=AWSTranscribeProvider.js.map