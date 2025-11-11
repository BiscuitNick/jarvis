//
//  AudioFormatHelper.swift
//  jarvis-ios
//
//  Helper utilities for working with AVAudioFormat and hardware audio
//

import Foundation
import AVFoundation

enum AudioFormatHelper {
    /// Creates an AVAudioFormat matching the current hardware sample rate
    ///
    /// IMPORTANT: Always use this instead of inputNode.outputFormat(forBus: 0)
    /// to avoid format mismatch errors. The inputNode returns its PREFERRED format
    /// (often 48kHz), not the actual hardware format which may be different (e.g., 16kHz).
    ///
    /// - Returns: An AVAudioFormat matching the hardware, or nil if creation fails
    static func createHardwareFormat() -> AVAudioFormat? {
        let audioSession = AVAudioSession.sharedInstance()
        let actualSampleRate = audioSession.sampleRate

        return AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: actualSampleRate,
            channels: 1,
            interleaved: false
        )
    }

    /// Gets the current hardware sample rate
    ///
    /// - Returns: The actual hardware sample rate in Hz
    static func getHardwareSampleRate() -> Double {
        return AVAudioSession.sharedInstance().sampleRate
    }

    /// Validates if a format matches the hardware format
    ///
    /// - Parameter format: The format to validate
    /// - Returns: True if the format matches hardware, false otherwise
    static func isHardwareFormat(_ format: AVAudioFormat) -> Bool {
        let hardwareSampleRate = getHardwareSampleRate()
        return format.sampleRate == hardwareSampleRate &&
               format.channelCount == 1 &&
               format.commonFormat == .pcmFormatFloat32
    }
}

// MARK: - Usage Examples
/*

 // ✅ CORRECT - Use hardware format
 guard let format = AudioFormatHelper.createHardwareFormat() else {
     throw AudioError.formatCreationFailed
 }
 inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
     // Process audio...
 }

 // ❌ INCORRECT - May cause format mismatch
 let format = inputNode.outputFormat(forBus: 0)  // Returns preferred format, not hardware!
 inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
     // Will crash if preferred != hardware
 }

 */
