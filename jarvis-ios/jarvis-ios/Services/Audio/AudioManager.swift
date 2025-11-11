//
//  AudioManager.swift
//  jarvis-ios
//
//  Audio session and recording management service
//

import Foundation
import AVFoundation
import Combine

@MainActor
class AudioManager: ObservableObject {
    @Published var isRecording = false
    @Published var audioLevel: Float = 0.0
    @Published var wakeWordEnabled = false
    @Published var voiceActivityDetected = false
    @Published var vadLatency: Double = 0.0

    private var audioEngine: AVAudioEngine?
    private var inputNode: AVAudioInputNode?
    private let wakeWordDetector: WakeWordDetector
    private let voiceActivityDetector: VoiceActivityDetector
    private var cancellables = Set<AnyCancellable>()

    init(wakeWordDetector: WakeWordDetector, voiceActivityDetector: VoiceActivityDetector) {
        self.wakeWordDetector = wakeWordDetector
        self.voiceActivityDetector = voiceActivityDetector
        setupAudioSession()
        setupBindings()
    }

    convenience init() {
        self.init(wakeWordDetector: WakeWordDetector(), voiceActivityDetector: VoiceActivityDetector())
    }

    private func setupAudioSession() {
        let audioSession = AVAudioSession.sharedInstance()
        do {
            try audioSession.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth])
            try audioSession.setActive(true)
        } catch {
            print("Failed to setup audio session: \(error)")
        }
    }

    private func setupBindings() {
        wakeWordDetector.$isListening
            .sink { [weak self] listening in
                self?.wakeWordEnabled = listening
            }
            .store(in: &cancellables)

        voiceActivityDetector.$isVoiceActive
            .sink { [weak self] active in
                self?.voiceActivityDetected = active
            }
            .store(in: &cancellables)

        voiceActivityDetector.$energyLevel
            .sink { [weak self] level in
                self?.audioLevel = level
            }
            .store(in: &cancellables)

        voiceActivityDetector.$latencyMs
            .sink { [weak self] latency in
                self?.vadLatency = latency
            }
            .store(in: &cancellables)
    }

    func requestPermissions() async -> Bool {
        // Request microphone permission
        let micPermission = await AVAudioApplication.requestRecordPermission()
        guard micPermission else { return false }

        // Request speech recognition permission
        let speechPermission = await wakeWordDetector.requestAuthorization()
        return speechPermission
    }

    func startWakeWordDetection() async throws {
        guard await requestPermissions() else {
            throw AudioError.permissionDenied
        }

        try wakeWordDetector.startListening()
    }

    func stopWakeWordDetection() {
        wakeWordDetector.stopListening()
    }

    func startVAD() throws {
        try voiceActivityDetector.startDetection()

        // Set up barge-in callback
        voiceActivityDetector.onVoiceActivityChanged = { [weak self] isActive in
            if isActive {
                print("🎤 Voice activity detected - triggering barge-in")
                Task { @MainActor in
                    self?.handleBargeIn()
                }
            }
        }
    }

    func stopVAD() {
        voiceActivityDetector.stopDetection()
    }

    private func handleBargeIn() {
        // This is where we'd interrupt playback and start processing user speech
        print("Barge-in triggered - stopping playback")
        // TODO: Connect to WebRTC/gRPC to signal barge-in
    }

    func startRecording() {
        isRecording = true
    }

    func stopRecording() {
        isRecording = false
    }

    enum AudioError: Error {
        case permissionDenied
        case audioSessionFailed
    }
}
