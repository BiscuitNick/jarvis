//
//  VoiceActivityDetector.swift
//  jarvis-ios
//
//  Voice Activity Detection with <150ms latency
//

import Foundation
import AVFoundation
import Accelerate
import Combine

@MainActor
class VoiceActivityDetector: ObservableObject {
    @Published var isVoiceActive = false
    @Published var energyLevel: Float = 0.0
    @Published var latencyMs: Double = 0.0

    // VAD Configuration
    private let chunkSize: AVAudioFrameCount = 960 // 20ms at 48kHz
    private let energyThreshold: Float = -50.0 // dB
    private let zeroCrossingRateThreshold: Float = 0.1
    private let hangoverFrames = 10 // Frames to wait before marking silence
    private var hangoverCount = 0
    private var isActive = false

    // Audio processing
    private let audioEngine = AVAudioEngine()
    private var lastProcessTime: Date?

    // Rolling average for energy smoothing
    private var energyHistory: [Float] = []
    private let energyHistorySize = 5

    // Callback for voice activity changes
    var onVoiceActivityChanged: ((Bool) -> Void)?

    func startDetection() throws {
        // Use actual hardware format to avoid format mismatch
        guard let format = AudioFormatHelper.createHardwareFormat() else {
            throw NSError(domain: "VoiceActivityDetector", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to create audio format"])
        }

        let inputNode = audioEngine.inputNode

        // Install tap with 20ms buffer (e.g., 320 frames at 16kHz, 960 frames at 48kHz)
        inputNode.installTap(onBus: 0, bufferSize: chunkSize, format: format) { [weak self] buffer, time in
            guard let self = self else { return }

            let startTime = Date()

            // Process audio buffer
            let voiceDetected = self.processAudioBuffer(buffer)

            // Calculate latency
            let latency = Date().timeIntervalSince(startTime) * 1000 // Convert to ms

            Task { @MainActor in
                self.latencyMs = latency
                self.updateVoiceActivity(voiceDetected)
            }
        }

        try audioEngine.start()
        isActive = true
    }

    func stopDetection() {
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        isActive = false
        isVoiceActive = false
        hangoverCount = 0
    }

    private func processAudioBuffer(_ buffer: AVAudioPCMBuffer) -> Bool {
        guard let channelData = buffer.floatChannelData?[0] else {
            return false
        }

        let frameCount = Int(buffer.frameLength)
        let samples = Array(UnsafeBufferPointer(start: channelData, count: frameCount))

        // 1. Energy-based detection
        let energy = calculateEnergy(samples: samples)
        energyLevel = energy

        // 2. Zero Crossing Rate (spectral analysis)
        let zcr = calculateZeroCrossingRate(samples: samples)

        // 3. Combine metrics for decision
        let energyAboveThreshold = energy > energyThreshold
        let zcrInRange = zcr > zeroCrossingRateThreshold && zcr < 0.5

        return energyAboveThreshold && zcrInRange
    }

    private func calculateEnergy(samples: [Float]) -> Float {
        // Calculate RMS energy in dB
        var rms: Float = 0.0
        vDSP_rmsqv(samples, 1, &rms, vDSP_Length(samples.count))

        // Convert to dB
        let db = 20 * log10(max(rms, 1e-10))

        // Smooth with rolling average
        energyHistory.append(db)
        if energyHistory.count > energyHistorySize {
            energyHistory.removeFirst()
        }

        return energyHistory.reduce(0, +) / Float(energyHistory.count)
    }

    private func calculateZeroCrossingRate(samples: [Float]) -> Float {
        var crossings = 0
        for i in 1..<samples.count {
            if (samples[i] >= 0 && samples[i-1] < 0) || (samples[i] < 0 && samples[i-1] >= 0) {
                crossings += 1
            }
        }
        return Float(crossings) / Float(samples.count)
    }

    private func updateVoiceActivity(_ detected: Bool) {
        if detected {
            hangoverCount = hangoverFrames
            if !isVoiceActive {
                isVoiceActive = true
                onVoiceActivityChanged?(true)
            }
        } else {
            hangoverCount -= 1
            if hangoverCount <= 0 && isVoiceActive {
                isVoiceActive = false
                onVoiceActivityChanged?(false)
            }
        }
    }
}
