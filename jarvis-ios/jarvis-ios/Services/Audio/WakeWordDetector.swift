//
//  WakeWordDetector.swift
//  jarvis-ios
//
//  Wake word detection service using Speech framework
//

import Foundation
import Speech
import AVFoundation
import Combine

@MainActor
class WakeWordDetector: ObservableObject {
    @Published var isListening = false
    @Published var wakeWordDetected = false
    @Published var lastTranscript = ""

    private var speechRecognizer: SFSpeechRecognizer?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()
    private var sessionStartTime: Date?
    private var restartTimer: Timer?

    // Configuration
    private let wakeWords = ["jarvis", "travis", "service", "nervous", "harvest"] // Common misheard variations
    private let confidenceThreshold: Float = 0.3 // Lowered threshold since wake word is uncommon
    private let bufferSize: AVAudioFrameCount = 1024

    init() {
        speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
        speechRecognizer?.defaultTaskHint = .dictation
    }

    func requestAuthorization() async -> Bool {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status == .authorized)
            }
        }
    }

    func startListening() throws {
        print("🎤 WakeWordDetector: Starting wake word detection for 'jarvis' (and variations: \(wakeWords.joined(separator: ", ")))")

        // Reset the wake word detected flag when starting a new session
        wakeWordDetected = false
        print("🔄 WakeWordDetector: Reset wakeWordDetected flag to false")

        // Cancel any existing task
        if recognitionTask != nil {
            recognitionTask?.cancel()
            recognitionTask = nil
        }

        // Stop audio engine and remove any existing tap
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        audioEngine.inputNode.removeTap(onBus: 0)

        // Configure audio session for recording
        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

        print("🎤 WakeWordDetector: Audio session configured")

        // Create recognition request
        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let recognitionRequest = recognitionRequest else {
            throw WakeWordError.recognitionRequestFailed
        }

        recognitionRequest.shouldReportPartialResults = true
        recognitionRequest.requiresOnDeviceRecognition = true // On-device only

        let inputNode = audioEngine.inputNode

        // Start recognition task
        recognitionTask = speechRecognizer?.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self = self else { return }

            if let error = error {
                print("❌ WakeWordDetector: Recognition error: \(error.localizedDescription)")
            }

            if let result = result {
                Task { @MainActor in
                    self.processRecognitionResult(result)
                }
            }

            if error != nil || result?.isFinal == true {
                // Stop engine first
                if self.audioEngine.isRunning {
                    self.audioEngine.stop()
                }

                // Remove tap AFTER engine is stopped
                inputNode.removeTap(onBus: 0)

                self.recognitionRequest = nil
                self.recognitionTask = nil

                // If there was an error and we're still supposed to be listening, restart
                if error != nil && self.isListening {
                    print("⚠️ WakeWordDetector: Restarting after error...")
                    Task { @MainActor in
                        try? await Task.sleep(nanoseconds: 500_000_000) // 0.5 seconds
                        if self.isListening {
                            try? self.startListening()
                        }
                    }
                }
            }
        }

        // Configure audio tap - use actual hardware format
        guard let recordingFormat = AudioFormatHelper.createHardwareFormat() else {
            throw WakeWordError.audioEngineNotAvailable
        }

        inputNode.installTap(onBus: 0, bufferSize: bufferSize, format: recordingFormat) { [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)
        }

        audioEngine.prepare()
        try audioEngine.start()

        isListening = true
        sessionStartTime = Date()

        // Schedule restart before 1-minute timeout (restart at 55 seconds)
        restartTimer?.invalidate()
        restartTimer = Timer.scheduledTimer(withTimeInterval: 55, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self = self, self.isListening else { return }
                print("⏰ WakeWordDetector: Approaching 1-minute limit, restarting...")
                self.stopListening()
                try? await Task.sleep(nanoseconds: 100_000_000) // 0.1 second delay
                if self.isListening { // Check if we should still be listening
                    try? self.startListening()
                }
            }
        }

        print("🎤 WakeWordDetector: Audio engine started, listening for wake word... (will restart in 55s)")
    }

    func stopListening() {
        // Cancel restart timer
        restartTimer?.invalidate()
        restartTimer = nil

        // End audio for the recognition request first
        recognitionRequest?.endAudio()

        // Cancel recognition task
        recognitionTask?.cancel()

        // Stop the audio engine
        if audioEngine.isRunning {
            audioEngine.stop()
        }

        // Remove tap AFTER engine is stopped
        audioEngine.inputNode.removeTap(onBus: 0)

        // Clean up
        recognitionTask = nil
        recognitionRequest = nil

        isListening = false

        // Reset wake word detection flag to allow re-detection
        wakeWordDetected = false

        print("🛑 WakeWordDetector: Stopped listening")
    }

    private func processRecognitionResult(_ result: SFSpeechRecognitionResult) {
        let transcript = result.bestTranscription.formattedString.lowercased()
        lastTranscript = transcript

        // Calculate average confidence for all words
        let overallConfidence = result.bestTranscription.segments.isEmpty ? 0.0 :
            result.bestTranscription.segments.reduce(0.0) { $0 + $1.confidence } / Float(result.bestTranscription.segments.count)

        print("🎤 WakeWordDetector: Heard: '\(transcript)' (confidence: \(String(format: "%.2f", overallConfidence)))")

        // Check if any wake word variation is detected
        let detectedWakeWord = wakeWords.first { word in
            transcript.contains(word)
        }

        if let detected = detectedWakeWord {
            print("🎯 WakeWordDetector: Wake word variation '\(detected)' found in transcript!")

            // Check confidence level for the specific wake word
            let confidence = calculateConfidenceForWord(word: detected, in: result)
            print("🎯 WakeWordDetector: Confidence for '\(detected)': \(String(format: "%.2f", confidence)) (threshold: \(confidenceThreshold))")

            if confidence >= confidenceThreshold {
                wakeWordDetected = true
                print("✅ WakeWordDetector: Wake word detected with sufficient confidence: \(confidence)")

                // Notify and potentially stop listening or transition to full recognition
                handleWakeWordDetection()
            } else {
                print("⚠️ WakeWordDetector: Wake word detected but confidence too low: \(confidence)")
            }
        }
    }

    private func calculateConfidenceForWord(word: String, in result: SFSpeechRecognitionResult) -> Float {
        // Get confidence for segments containing the specific word
        let segments = result.bestTranscription.segments
        var confidenceSum: Float = 0.0
        var count = 0

        for segment in segments where segment.substring.lowercased().contains(word) {
            confidenceSum += segment.confidence
            count += 1
        }

        return count > 0 ? confidenceSum / Float(count) : 0.0
    }


    private func handleWakeWordDetection() {
        // The flag will be reset when stopListening() is called
        // This prevents double triggers and ensures clean state management
        print("🔔 WakeWordDetector: Wake word handler called - flag will reset on stop")
    }

    enum WakeWordError: Error {
        case recognitionRequestFailed
        case audioEngineNotAvailable
        case authorizationDenied
    }
}
