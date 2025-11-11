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
