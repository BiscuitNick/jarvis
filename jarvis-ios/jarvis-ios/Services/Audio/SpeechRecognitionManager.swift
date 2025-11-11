//
//  SpeechRecognitionManager.swift
//  jarvis-ios
//
//  Native iOS Speech Recognition for full transcription
//  Extends WakeWordDetector approach for continuous speech-to-text
//

import Foundation
import Speech
import AVFoundation
import Combine

@MainActor
class SpeechRecognitionManager: ObservableObject {
    @Published var isRecognizing = false
    @Published var currentTranscript = ""
    @Published var finalTranscript = ""
    @Published var recognitionError: String?

    private var speechRecognizer: SFSpeechRecognizer?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()

    // Configuration
    private var useOnDeviceRecognition = true // Toggle based on privacy preference
    private let bufferSize: AVAudioFrameCount = 1024

    // Callback for sending transcripts to backend
    var onTranscript: ((String, Bool) -> Void)?

    init(locale: Locale = Locale(identifier: "en-US")) {
        speechRecognizer = SFSpeechRecognizer(locale: locale)
        speechRecognizer?.defaultTaskHint = .dictation
    }

    func requestAuthorization() async -> Bool {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status == .authorized)
            }
        }
    }

    /// Start continuous speech recognition
    /// Note: On-device recognition has 1-minute limit, will need to restart
    func startRecognition() throws {
        // Cancel any existing task
        recognitionTask?.cancel()
        recognitionTask = nil

        // Configure audio session
        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

        // Create recognition request
        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let recognitionRequest = recognitionRequest else {
            throw SpeechRecognitionError.recognitionRequestFailed
        }

        recognitionRequest.shouldReportPartialResults = true
        recognitionRequest.requiresOnDeviceRecognition = useOnDeviceRecognition

        // For longer conversations, consider these options:
        if !useOnDeviceRecognition {
            // Cloud-based can handle longer durations
            recognitionRequest.taskHint = .dictation
        }

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)

        // Start recognition task
        recognitionTask = speechRecognizer?.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self = self else { return }

            Task { @MainActor in
                if let result = result {
                    self.currentTranscript = result.bestTranscription.formattedString

                    // Send partial transcript to backend
                    self.onTranscript?(self.currentTranscript, result.isFinal)

                    if result.isFinal {
                        self.finalTranscript = self.currentTranscript
                        print("✅ Final transcript: \(self.currentTranscript)")
                    }
                }

                if let error = error {
                    self.recognitionError = error.localizedDescription
                    print("❌ Recognition error: \(error)")

                    // Handle 1-minute timeout for on-device recognition
                    if self.useOnDeviceRecognition {
                        self.handleOnDeviceTimeout()
                    }
                }

                if error != nil || result?.isFinal == true {
                    self.audioEngine.stop()
                    inputNode.removeTap(onBus: 0)
                    self.recognitionRequest = nil
                    self.recognitionTask = nil
                    self.isRecognizing = false
                }
            }
        }

        // Install audio tap to feed audio to recognition
        inputNode.installTap(onBus: 0, bufferSize: bufferSize, format: recordingFormat) { [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)
        }

        audioEngine.prepare()
        try audioEngine.start()

        isRecognizing = true
        print("🎤 Speech recognition started (on-device: \(useOnDeviceRecognition))")
    }

    func stopRecognition() {
        audioEngine.stop()
        recognitionRequest?.endAudio()
        audioEngine.inputNode.removeTap(onBus: 0)

        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = nil

        isRecognizing = false
        print("🛑 Speech recognition stopped")
    }

    /// Handle the 1-minute timeout for on-device recognition
    /// Restart the recognition to continue
    private func handleOnDeviceTimeout() {
        print("⏱️ On-device recognition timeout - restarting...")

        // Stop current session
        stopRecognition()

        // Restart after brief delay
        Task {
            try? await Task.sleep(nanoseconds: 100_000_000) // 0.1 seconds
            try? startRecognition()
        }
    }

    /// Switch between on-device and cloud recognition
    func setRecognitionMode(onDevice: Bool) {
        useOnDeviceRecognition = onDevice
        print("🔄 Recognition mode: \(onDevice ? "on-device" : "cloud")")
    }

    enum SpeechRecognitionError: Error {
        case recognitionRequestFailed
        case audioEngineNotAvailable
        case authorizationDenied
    }
}

// MARK: - Usage Example
/*

 // Initialize
 let speechManager = SpeechRecognitionManager()

 // Request permissions
 let authorized = await speechManager.requestAuthorization()
 guard authorized else { return }

 // Set callback for transcripts
 speechManager.onTranscript = { transcript, isFinal in
     if isFinal {
         // Send final transcript to backend via gRPC
         gRPCClient.sendTranscript(transcript)
     } else {
         // Optionally show partial results in UI
         updateUIWithPartialTranscript(transcript)
     }
 }

 // Start recognition
 try speechManager.startRecognition()

 // For privacy-conscious users, use on-device
 speechManager.setRecognitionMode(onDevice: true)

 // For better accuracy and longer sessions, use cloud
 speechManager.setRecognitionMode(onDevice: false)

 */
