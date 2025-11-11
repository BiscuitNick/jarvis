/**
 * AWS Transcribe Streaming Provider
 * Implements real-time speech-to-text using AWS Transcribe Streaming API
 */
import { ASRProvider, TranscriptionResult, ASRConfig } from './ASRProvider';
export declare class AWSTranscribeProvider implements ASRProvider {
    private client;
    private audioStream?;
    private audioGeneratorController?;
    private isStreaming;
    constructor(region?: string);
    startStream(onTranscript: (result: TranscriptionResult) => void, onError: (error: Error) => void, config?: ASRConfig): Promise<void>;
    private processTranscriptStream;
    sendAudio(audioChunk: Buffer): Promise<void>;
    endStream(): Promise<void>;
    getName(): string;
}
//# sourceMappingURL=AWSTranscribeProvider.d.ts.map