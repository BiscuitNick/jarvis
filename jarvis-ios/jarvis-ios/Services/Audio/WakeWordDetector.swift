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

    // Configuration
    private let wakeWord = "jarvis"
    private let confidenceThreshold: Float = 0.5
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
        // Cancel any existing task
        if recognitionTask != nil {
            recognitionTask?.cancel()
            recognitionTask = nil
        }

        // Configure audio session for recording
        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

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

            if let result = result {
                Task { @MainActor in
                    self.processRecognitionResult(result)
                }
            }

            if error != nil || result?.isFinal == true {
                self.audioEngine.stop()
                inputNode.removeTap(onBus: 0)
                self.recognitionRequest = nil
                self.recognitionTask = nil
            }
        }

        // Configure audio tap
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: bufferSize, format: recordingFormat) { [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)
        }

        audioEngine.prepare()
        try audioEngine.start()

        isListening = true
    }

    func stopListening() {
        audioEngine.stop()
        recognitionRequest?.endAudio()
        audioEngine.inputNode.removeTap(onBus: 0)

        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = nil

        isListening = false
    }

    private func processRecognitionResult(_ result: SFSpeechRecognitionResult) {
        let transcript = result.bestTranscription.formattedString.lowercased()
        lastTranscript = transcript

        // Check if wake word is detected
        if transcript.contains(wakeWord) {
            // Check confidence level
            let confidence = calculateConfidence(for: result)

            if confidence >= confidenceThreshold {
                wakeWordDetected = true
                print("Wake word detected with confidence: \(confidence)")

                // Notify and potentially stop listening or transition to full recognition
                handleWakeWordDetection()
            }
        }
    }

    private func calculateConfidence(for result: SFSpeechRecognitionResult) -> Float {
        // Average confidence across all segments containing the wake word
        let segments = result.bestTranscription.segments
        var confidenceSum: Float = 0.0
        var count = 0

        for segment in segments where segment.substring.lowercased().contains(wakeWord) {
            confidenceSum += segment.confidence
            count += 1
        }

        return count > 0 ? confidenceSum / Float(count) : 0.0
    }

    private func handleWakeWordDetection() {
        // Reset the flag after a short delay to allow for re-detection
        Task {
            try? await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds
            await MainActor.run {
                self.wakeWordDetected = false
            }
        }
    }

    enum WakeWordError: Error {
        case recognitionRequestFailed
        case audioEngineNotAvailable
        case authorizationDenied
    }
}
