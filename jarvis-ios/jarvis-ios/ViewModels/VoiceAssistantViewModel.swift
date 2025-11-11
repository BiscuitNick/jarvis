//
//  VoiceAssistantViewModel.swift
//  jarvis-ios
//
//  Main ViewModel coordinating all services
//

import Foundation
import Combine

// MARK: - Recognition Mode

enum RecognitionMode: String, CaseIterable, Identifiable {
    case privacyMode = "Privacy Mode"
    case standardMode = "Standard Mode"
    case professionalMode = "Professional Mode"

    var id: String { rawValue }

    var description: String {
        switch self {
        case .privacyMode:
            return "On-device recognition. Audio never leaves your device. Works offline. Limited to 1-minute sessions."
        case .standardMode:
            return "Apple cloud recognition. Better accuracy, unlimited duration. Requires internet."
        case .professionalMode:
            return "WebRTC streaming with 3rd party STT. Best accuracy for professional use."
        }
    }

    var icon: String {
        switch self {
        case .privacyMode: return "lock.shield.fill"
        case .standardMode: return "icloud.fill"
        case .professionalMode: return "waveform.circle.fill"
        }
    }
}

@MainActor
class VoiceAssistantViewModel: ObservableObject {
    @Published var transcript = ""
    @Published var messages: [TranscriptMessage] = []
    @Published var isStreaming = false
    @Published var isListening = false
    @Published var wakeWordDetected = false
    @Published var wakeWordEnabled = false
    @Published var voiceActivityDetected = false
    @Published var vadLatency: Double = 0.0
    @Published var audioAmplitudes: [Float] = Array(repeating: 0.1, count: 50)
    @Published var webRTCConnected = false
    @Published var audioStreamActive = false
    @Published var bytesSent: Int64 = 0
    @Published var grpcConnected = false
    @Published var currentSessionId: String?
    @Published var sessionStatus: String = "inactive"

    // Speech Recognition
    @Published var recognitionMode: RecognitionMode {
        didSet {
            UserDefaults.standard.set(recognitionMode.rawValue, forKey: "recognitionMode")
            updateRecognitionMode()
        }
    }
    @Published var isRecognizing = false
    @Published var recognitionError: String?

    let audioManager: AudioManager
    let webRTCClient: WebRTCClient
    let grpcClient: GRPCClient
    let authService: AuthenticationService
    let speechRecognitionManager: SpeechRecognitionManager

    private var cancellables = Set<AnyCancellable>()

    init(
        audioManager: AudioManager,
        webRTCClient: WebRTCClient,
        grpcClient: GRPCClient,
        authService: AuthenticationService,
        speechRecognitionManager: SpeechRecognitionManager = SpeechRecognitionManager()
    ) {
        self.audioManager = audioManager
        self.webRTCClient = webRTCClient
        self.grpcClient = grpcClient
        self.authService = authService
        self.speechRecognitionManager = speechRecognitionManager

        // Load saved recognition mode from UserDefaults
        if let savedMode = UserDefaults.standard.string(forKey: "recognitionMode"),
           let mode = RecognitionMode(rawValue: savedMode) {
            self.recognitionMode = mode
        } else {
            // Default to standard mode for best balance
            self.recognitionMode = .standardMode
        }

        setupBindings()
        setupSpeechRecognition()
    }

    private func setupBindings() {
        audioManager.$isRecording
            .sink { [weak self] isRecording in
                self?.isListening = isRecording
            }
            .store(in: &cancellables)

        audioManager.$wakeWordEnabled
            .sink { [weak self] enabled in
                self?.wakeWordEnabled = enabled
            }
            .store(in: &cancellables)

        audioManager.$voiceActivityDetected
            .sink { [weak self] detected in
                self?.voiceActivityDetected = detected
            }
            .store(in: &cancellables)

        audioManager.$vadLatency
            .sink { [weak self] latency in
                self?.vadLatency = latency
            }
            .store(in: &cancellables)

        webRTCClient.$connectionState
            .sink { [weak self] state in
                self?.webRTCConnected = (state == .connected)
            }
            .store(in: &cancellables)

        webRTCClient.$audioStreamActive
            .sink { [weak self] active in
                self?.audioStreamActive = active
            }
            .store(in: &cancellables)

        webRTCClient.$bytesSent
            .sink { [weak self] bytes in
                self?.bytesSent = bytes
            }
            .store(in: &cancellables)

        grpcClient.$isConnected
            .sink { [weak self] connected in
                self?.grpcConnected = connected
            }
            .store(in: &cancellables)

        grpcClient.$currentSessionId
            .sink { [weak self] sessionId in
                self?.currentSessionId = sessionId
            }
            .store(in: &cancellables)

        // Speech recognition bindings
        speechRecognitionManager.$isRecognizing
            .sink { [weak self] recognizing in
                self?.isRecognizing = recognizing
            }
            .store(in: &cancellables)

        speechRecognitionManager.$currentTranscript
            .sink { [weak self] transcript in
                self?.transcript = transcript
            }
            .store(in: &cancellables)

        speechRecognitionManager.$recognitionError
            .sink { [weak self] error in
                self?.recognitionError = error
            }
            .store(in: &cancellables)
    }

    private func setupSpeechRecognition() {
        // Set up callback for transcripts
        speechRecognitionManager.onTranscript = { [weak self] transcript, isFinal in
            Task { @MainActor in
                guard let self = self else { return }

                self.transcript = transcript

                if isFinal {
                    print("📝 Final transcript: \(transcript)")

                    // Add to messages
                    self.addUserMessage(transcript)

                    // Send to backend based on mode
                    if self.recognitionMode != .professionalMode {
                        // For native speech modes, send text via gRPC
                        await self.sendTranscriptToBackend(transcript)
                    }
                }
            }
        }

        // Apply initial recognition mode
        updateRecognitionMode()
    }

    private func updateRecognitionMode() {
        switch recognitionMode {
        case .privacyMode:
            speechRecognitionManager.setRecognitionMode(onDevice: true)
            print("🔒 Recognition mode: Privacy (on-device)")

        case .standardMode:
            speechRecognitionManager.setRecognitionMode(onDevice: false)
            print("☁️ Recognition mode: Standard (Apple cloud)")

        case .professionalMode:
            print("💼 Recognition mode: Professional (WebRTC)")
        }
    }

    private func sendTranscriptToBackend(_ transcript: String) async {
        // TODO: Implement gRPC message sending
        print("📤 Sending transcript to backend: \(transcript)")
        // This will be implemented when gRPC streaming is ready
        // try? await grpcClient.sendUserMessage(transcript)
    }

    func startWakeWordDetection() async {
        do {
            try await audioManager.startWakeWordDetection()
        } catch {
            print("Failed to start wake word detection: \(error)")
        }
    }

    func stopWakeWordDetection() {
        audioManager.stopWakeWordDetection()
    }

    func startVAD() {
        do {
            try audioManager.startVAD()
        } catch {
            print("Failed to start VAD: \(error)")
        }
    }

    func stopVAD() {
        audioManager.stopVAD()
    }

    func connectWebRTC(serverURL: String = "wss://your-backend-server.com") async {
        do {
            try await webRTCClient.connect(to: serverURL)
            print("WebRTC connected successfully")
        } catch {
            print("WebRTC connection failed: \(error)")
        }
    }

    func disconnectWebRTC() {
        webRTCClient.disconnect()
    }

    func startAudioStreaming() {
        do {
            try webRTCClient.startAudioStream()
        } catch {
            print("Failed to start audio streaming: \(error)")
        }
    }

    func stopAudioStreaming() {
        webRTCClient.stopAudioStream()
    }

    func startListening() {
        switch recognitionMode {
        case .privacyMode, .standardMode:
            // Use native speech recognition
            do {
                try speechRecognitionManager.startRecognition()
                audioManager.startRecording() // For UI feedback
            } catch {
                print("❌ Failed to start speech recognition: \(error)")
                recognitionError = error.localizedDescription
            }

        case .professionalMode:
            // Use traditional WebRTC approach
            audioManager.startRecording()
            startAudioStreaming()
        }
    }

    func stopListening() {
        switch recognitionMode {
        case .privacyMode, .standardMode:
            // Stop native speech recognition
            speechRecognitionManager.stopRecognition()
            audioManager.stopRecording()

        case .professionalMode:
            // Stop WebRTC streaming
            audioManager.stopRecording()
            stopAudioStreaming()
        }
    }

    // Request permissions for speech recognition
    func requestSpeechPermissions() async -> Bool {
        let authorized = await speechRecognitionManager.requestAuthorization()
        if !authorized {
            recognitionError = "Speech recognition permission denied"
        }
        return authorized
    }

    func authenticate() async throws {
        // Try biometric authentication if enabled
        if authService.biometricAuthEnabled {
            let biometricSuccess = try await authService.authenticateWithBiometrics()
            guard biometricSuccess else {
                throw AuthenticationError.biometricFailed
            }
        }

        // Register device if not already registered
        if authService.getDeviceToken() == nil {
            let (deviceToken, userId) = try await authService.registerDevice()
            try await grpcClient.authenticate(with: deviceToken, userId: userId)
        } else {
            // Use existing credentials
            let userId = authService.getUserId() ?? UUID().uuidString
            if let token = authService.getDeviceToken() {
                try await grpcClient.authenticate(with: token, userId: userId)
            }
        }
    }

    enum AuthenticationError: Error {
        case biometricFailed
    }

    // MARK: - Session Management

    func startSession(
        audioConfig: AudioConfig = .default,
        voiceConfig: VoiceConfig = .default
    ) async throws {
        let response = try await grpcClient.startSession(
            audioConfig: audioConfig,
            voiceConfig: voiceConfig,
            metadata: [
                "platform": "ios",
                "app_version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"
            ]
        )

        if let sessionId = response.sessionId as String?, !sessionId.isEmpty {
            print("✅ Session started: \(sessionId)")

            // Start WebRTC connection with offer from backend
            if let webrtcOffer = response.webrtcOffer {
                // TODO: Use the WebRTC offer to establish connection
                print("📡 Received WebRTC offer")
            }

            // Start audio streaming
            startAudioStreaming()
        } else if let errorMessage = response.errorMessage {
            throw GRPCClientError.serverError(errorMessage)
        }
    }

    func stopSession() async throws {
        // Stop audio streaming first
        stopAudioStreaming()

        // Stop the session via gRPC
        let _ = try await grpcClient.stopSession()
        sessionStatus = "inactive"
    }

    func updateSessionConfig(
        audioConfig: AudioConfig? = nil,
        voiceConfig: VoiceConfig? = nil
    ) async throws {
        let _ = try await grpcClient.updateSessionConfig(
            audioConfig: audioConfig,
            voiceConfig: voiceConfig
        )
    }

    func refreshSessionStatus() async throws {
        let response = try await grpcClient.getSessionStatus()
        sessionStatus = response.status
    }

    func listSessions() async throws -> [SessionInfo] {
        let response = try await grpcClient.listSessions()
        return response.sessions
    }

    // MARK: - Transcript Management

    func addUserMessage(_ text: String) {
        let message = TranscriptMessage(
            text: text,
            timestamp: Date(),
            role: .user,
            sources: nil
        )
        messages.append(message)
        transcript = text
    }

    func addAssistantMessage(_ text: String, sources: [Citation]? = nil) {
        let message = TranscriptMessage(
            text: text,
            timestamp: Date(),
            role: .assistant,
            sources: sources
        )
        messages.append(message)
        isStreaming = false
    }

    func addSystemMessage(_ text: String) {
        let message = TranscriptMessage(
            text: text,
            timestamp: Date(),
            role: .system,
            sources: nil
        )
        messages.append(message)
    }

    func startStreaming() {
        isStreaming = true
    }

    func clearTranscript() {
        messages.removeAll()
        transcript = ""
        isStreaming = false
    }

    // MARK: - Audio Visualization

    func updateAudioAmplitudes(_ amplitudes: [Float]) {
        self.audioAmplitudes = amplitudes
    }

    func simulateAudioAmplitudes() {
        // For testing - generate random amplitudes
        audioAmplitudes = (0..<50).map { _ in Float.random(in: 0.1...0.9) }
    }
}
