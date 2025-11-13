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
    private var isManualStop = false // Track if stop was initiated by user

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
        print("🎤 SpeechRecognitionManager.startRecognition() called")

        // Clear previous transcripts to start fresh
        print("   Clearing previous transcripts...")
        currentTranscript = ""
        finalTranscript = ""
        recognitionError = nil
        isManualStop = false // Reset flag for new session

        // Cancel any existing task
        recognitionTask?.cancel()
        recognitionTask = nil

        // Stop audio engine and remove any existing tap
        if audioEngine.isRunning {
            audioEngine.stop()
        }

        // Remove any existing tap before installing new one
        let inputNode = audioEngine.inputNode
        // removeTap is safe to call even if no tap exists
        inputNode.removeTap(onBus: 0)

        // Use AudioManager's existing audio session configuration
        // DO NOT reconfigure the session - it causes Error 1101
        // AudioManager already set up .playAndRecord with .voiceChat mode
        print("📱 Using existing audio session configuration")

        // Verify audio session is active
        let audioSession = AVAudioSession.sharedInstance()
        if !audioSession.isOtherAudioPlaying {
            do {
                try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
            } catch {
                print("⚠️ Could not activate audio session: \(error)")
            }
        }

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

        // CRITICAL: Use the HARDWARE format, not the node's preferred format
        guard let recordingFormat = AudioFormatHelper.createHardwareFormat() else {
            throw SpeechRecognitionError.audioEngineNotAvailable
        }
        print("🎙️ Using hardware format: \(recordingFormat.sampleRate)Hz, \(recordingFormat.channelCount) channels")

        // Start recognition task
        recognitionTask = speechRecognizer?.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self = self else { return }

            Task { @MainActor in
                if let result = result {
                    self.currentTranscript = result.bestTranscription.formattedString
                    print("📢 Speech result: '\(self.currentTranscript)' (isFinal: \(result.isFinal))")

                    // Send partial transcript to backend
                    self.onTranscript?(self.currentTranscript, result.isFinal)

                    if result.isFinal {
                        self.finalTranscript = self.currentTranscript
                        print("✅ Final transcript: \(self.currentTranscript)")
                    }
                }

                var shouldCleanup = false
                if let error = error {
                    let nsError = error as NSError

                    // Log error 1101 with audio session state for debugging
                    if nsError.domain == "kAFAssistantErrorDomain" && nsError.code == 1101 {
                        // Log session state for debugging
                        let session = AVAudioSession.sharedInstance()
                        print("⚠️ Speech recognition error 1101 - Audio session state:")
                        print("   Category: \(session.category.rawValue)")
                        print("   Mode: \(session.mode.rawValue)")
                        print("   Other audio playing: \(session.isOtherAudioPlaying)")
                        print("   Sample rate: \(session.sampleRate)Hz")
                        print("   Input available: \(session.isInputAvailable)")
                        // Don't cleanup for this error - it's spurious and recognition can continue
                    } else if nsError.domain == "kAFAssistantErrorDomain" && nsError.code == 1110 {
                        // Error 1110 = "No speech detected"
                        // This happens after stopping recording - don't auto-restart if it was a manual stop
                        print("ℹ️ No speech detected (error 1110)")
                        if !self.isManualStop && self.useOnDeviceRecognition {
                            print("⏱️ Auto-restarting due to timeout (not a manual stop)")
                            self.handleOnDeviceTimeout()
                        } else {
                            print("✋ Manual stop detected - not auto-restarting")
                            shouldCleanup = true
                        }
                    } else {
                        self.recognitionError = error.localizedDescription
                        print("❌ Recognition error: \(error)")
                        shouldCleanup = true
                    }
                }

                if shouldCleanup || result?.isFinal == true {
                    // Stop engine first
                    if self.audioEngine.isRunning {
                        self.audioEngine.stop()
                    }

                    // Remove tap AFTER engine is stopped
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
        // Mark as manual stop to prevent auto-restart
        isManualStop = true

        // End audio for the recognition request first
        recognitionRequest?.endAudio()

        // Cancel recognition task
        recognitionTask?.cancel()

        // Stop the audio engine
        if audioEngine.isRunning {
            audioEngine.stop()
        }

        // Remove tap AFTER engine is stopped
        // removeTap is safe to call even if no tap exists
        audioEngine.inputNode.removeTap(onBus: 0)

        // Clean up
        recognitionTask = nil
        recognitionRequest = nil

        isRecognizing = false
        print("🛑 Speech recognition stopped (manual)")
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
