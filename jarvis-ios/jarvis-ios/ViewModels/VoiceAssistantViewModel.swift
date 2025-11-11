//
//  VoiceAssistantViewModel.swift
//  jarvis-ios
//
//  Main ViewModel coordinating all services
//

import Foundation
import Combine

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

    let audioManager: AudioManager
    let webRTCClient: WebRTCClient
    let grpcClient: GRPCClient
    let authService: AuthenticationService

    private var cancellables = Set<AnyCancellable>()

    init(
        audioManager: AudioManager,
        webRTCClient: WebRTCClient,
        grpcClient: GRPCClient,
        authService: AuthenticationService
    ) {
        self.audioManager = audioManager
        self.webRTCClient = webRTCClient
        self.grpcClient = grpcClient
        self.authService = authService

        setupBindings()
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
        audioManager.startRecording()
    }

    func stopListening() {
        audioManager.stopRecording()
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
