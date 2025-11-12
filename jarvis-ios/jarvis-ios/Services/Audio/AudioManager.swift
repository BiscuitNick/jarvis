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
    @Published var vadEnabled = false
    @Published var voiceActivityDetected = false
    @Published var vadLatency: Double = 0.0
    @Published var audioRouteDescription = "Unknown"
    @Published var isSessionActive = false
    @Published var wasInterrupted = false

    private var audioEngine: AVAudioEngine?
    private var inputNode: AVAudioInputNode?
    let wakeWordDetector: WakeWordDetector // Made accessible for ViewModel bindings
    private let voiceActivityDetector: VoiceActivityDetector
    private var cancellables = Set<AnyCancellable>()

    // Session state tracking
    private var shouldResumeAfterInterruption = false
    private var wasRecordingBeforeInterruption = false

    init(wakeWordDetector: WakeWordDetector, voiceActivityDetector: VoiceActivityDetector) {
        self.wakeWordDetector = wakeWordDetector
        self.voiceActivityDetector = voiceActivityDetector
        setupAudioSession()
        setupBindings()
        registerAudioSessionNotifications()
    }

    convenience init() {
        self.init(wakeWordDetector: WakeWordDetector(), voiceActivityDetector: VoiceActivityDetector())
    }

    deinit {
        // Note: Cannot call MainActor-isolated methods from deinit
        // NotificationCenter observers will be removed automatically
        // Audio session will be deactivated automatically by the system
    }

    // MARK: - Audio Session Configuration

    private func setupAudioSession() {
        let audioSession = AVAudioSession.sharedInstance()
        do {
            // Configure category for simultaneous recording and playback
            try audioSession.setCategory(
                .playAndRecord,
                mode: .voiceChat,
                options: [
                    .defaultToSpeaker,
                    .allowBluetoothA2DP,
                    .mixWithOthers
                ]
            )

            // Set preferred IO buffer duration for low latency
            try audioSession.setPreferredIOBufferDuration(0.005) // 5ms

            // Set preferred sample rate
            try audioSession.setPreferredSampleRate(16000)

            // Activate the session
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

            isSessionActive = true
            updateAudioRouteDescription()

            print("✅ Audio session configured successfully")
            print("📊 Sample rate: \(audioSession.sampleRate)Hz")
            print("📊 IO buffer duration: \(audioSession.ioBufferDuration)s")
            print("🔊 Output route: \(audioSession.currentRoute.outputs.first?.portName ?? "unknown")")
        } catch {
            print("❌ Failed to setup audio session: \(error)")
            isSessionActive = false
        }
    }

    func activateAudioSession() throws {
        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        isSessionActive = true
        print("✅ Audio session activated")
    }

    func deactivateAudioSession() {
        let audioSession = AVAudioSession.sharedInstance()
        do {
            try audioSession.setActive(false, options: .notifyOthersOnDeactivation)
            isSessionActive = false
            print("🔌 Audio session deactivated")
        } catch {
            print("⚠️ Failed to deactivate audio session: \(error)")
        }
    }

    private func updateAudioRouteDescription() {
        let audioSession = AVAudioSession.sharedInstance()
        let route = audioSession.currentRoute

        var routeDesc = ""
        if let output = route.outputs.first {
            routeDesc = output.portName
        }
        if let input = route.inputs.first {
            routeDesc += " → \(input.portName)"
        }

        audioRouteDescription = routeDesc.isEmpty ? "Unknown" : routeDesc
    }

    // MARK: - Notification Handlers

    private func registerAudioSessionNotifications() {
        let notificationCenter = NotificationCenter.default

        // Interruption handling
        notificationCenter.addObserver(
            self,
            selector: #selector(handleInterruption),
            name: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance()
        )

        // Route change handling
        notificationCenter.addObserver(
            self,
            selector: #selector(handleRouteChange),
            name: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance()
        )

        // Media services reset
        notificationCenter.addObserver(
            self,
            selector: #selector(handleMediaServicesReset),
            name: AVAudioSession.mediaServicesWereResetNotification,
            object: AVAudioSession.sharedInstance()
        )

        print("📡 Audio session notifications registered")
    }

    private func unregisterAudioSessionNotifications() {
        NotificationCenter.default.removeObserver(self)
        print("📡 Audio session notifications unregistered")
    }

    @objc private func handleInterruption(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else {
            return
        }

        Task { @MainActor in
            switch type {
            case .began:
                // Interruption began (e.g., phone call)
                print("⚠️ Audio session interrupted")
                wasInterrupted = true
                wasRecordingBeforeInterruption = isRecording

                if isRecording {
                    stopRecording()
                }
                if wakeWordEnabled {
                    stopWakeWordDetection()
                }
                if voiceActivityDetected {
                    stopVAD()
                }

            case .ended:
                // Interruption ended
                print("✅ Audio session interruption ended")
                wasInterrupted = false

                guard let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt else {
                    return
                }
                let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)

                if options.contains(.shouldResume) {
                    // Resume audio session
                    do {
                        try activateAudioSession()

                        // Restore previous state
                        if wasRecordingBeforeInterruption {
                            startRecording()
                        }
                        if shouldResumeAfterInterruption {
                            try await startWakeWordDetection()
                        }

                        print("✅ Audio session resumed after interruption")
                    } catch {
                        print("❌ Failed to resume audio session: \(error)")
                    }
                }

            @unknown default:
                break
            }
        }
    }

    @objc private func handleRouteChange(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else {
            return
        }

        Task { @MainActor in
            updateAudioRouteDescription()

            switch reason {
            case .newDeviceAvailable:
                print("🎧 New audio device connected: \(audioRouteDescription)")
                // Optionally pause/resume audio

            case .oldDeviceUnavailable:
                print("🎧 Audio device disconnected: \(audioRouteDescription)")
                if let previousRoute = userInfo[AVAudioSessionRouteChangePreviousRouteKey] as? AVAudioSessionRouteDescription {
                    let wasHeadphones = previousRoute.outputs.contains { $0.portType == .headphones || $0.portType == .bluetoothA2DP }
                    if wasHeadphones && isRecording {
                        // Headphones unplugged during recording - pause
                        stopRecording()
                        print("⏸️ Recording paused due to headphones disconnection")
                    }
                }

            case .categoryChange:
                print("🔄 Audio category changed")

            case .override:
                print("🔄 Audio route overridden")

            default:
                print("🔄 Audio route changed: \(reason.rawValue)")
            }
        }
    }

    @objc private func handleMediaServicesReset(notification: Notification) {
        Task { @MainActor in
            print("⚠️ Media services were reset - reinitializing audio session")

            // Save current state
            let wasRecording = isRecording
            let wakeWordWasEnabled = wakeWordEnabled

            // Stop everything
            if isRecording { stopRecording() }
            if wakeWordEnabled { stopWakeWordDetection() }
            if voiceActivityDetected { stopVAD() }

            // Reinitialize audio session
            setupAudioSession()

            // Restore state
            if wasRecording {
                startRecording()
            }
            if wakeWordWasEnabled {
                try? await startWakeWordDetection()
            }
        }
    }

    private func setupBindings() {
        wakeWordDetector.$isListening
            .sink { [weak self] listening in
                self?.wakeWordEnabled = listening
            }
            .store(in: &cancellables)

        voiceActivityDetector.$isDetecting
            .sink { [weak self] detecting in
                self?.vadEnabled = detecting
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
