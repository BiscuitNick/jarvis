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
    @Published var isListening = false
    @Published var wakeWordDetected = false
    @Published var wakeWordEnabled = false
    @Published var voiceActivityDetected = false
    @Published var vadLatency: Double = 0.0
    @Published var webRTCConnected = false
    @Published var audioStreamActive = false
    @Published var bytesSent: Int64 = 0

    private let audioManager: AudioManager
    private let webRTCClient: WebRTCClient
    private let grpcClient: GRPCClient
    private let authService: AuthenticationService

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
        // Generate or retrieve device token
        if let token = authService.getDeviceToken() {
            try await grpcClient.authenticate(with: token)
        } else {
            let newToken = UUID().uuidString
            try authService.saveDeviceToken(newToken)
            try await grpcClient.authenticate(with: newToken)
        }
    }
}
