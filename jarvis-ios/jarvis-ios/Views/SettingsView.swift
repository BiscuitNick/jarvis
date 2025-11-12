//
//  SettingsView.swift
//  jarvis-ios
//
//  Settings screen for Jarvis voice assistant
//

import SwiftUI
import AVFoundation

struct SettingsView: View {
    @ObservedObject var viewModel: VoiceAssistantViewModel
    @Environment(\.dismiss) var dismiss
    @State private var voiceGroups: [VoiceGroup] = []

    var body: some View {
        NavigationView {
            Form {
                // Recognition Mode Section
                Section {
                    ForEach(RecognitionMode.allCases) { mode in
                        RecognitionModeRow(
                            mode: mode,
                            isSelected: viewModel.recognitionMode == mode,
                            action: {
                                viewModel.recognitionMode = mode
                            }
                        )
                    }
                } header: {
                    Text("Speech Recognition Mode")
                } footer: {
                    Text(viewModel.recognitionMode.description)
                        .font(.caption)
                }

                // Voice Selection Section
                Section {
                    NavigationLink(destination: VoiceSelectionView(viewModel: viewModel, voiceGroups: voiceGroups)) {
                        HStack {
                            Image(systemName: "speaker.wave.2.fill")
                                .foregroundColor(.secondary)

                            Text("Voice")

                            Spacer()

                            Text(selectedVoiceName)
                                .foregroundColor(.secondary)
                                .font(.callout)
                        }
                    }
                } header: {
                    Text("Text-to-Speech")
                } footer: {
                    Text("Choose the voice for agent responses. Enhanced and Premium voices offer better quality.")
                        .font(.caption)
                }

                // Connection Status Section
                Section("Connection Status") {
                    StatusRow(
                        title: "gRPC",
                        isConnected: viewModel.grpcConnected,
                        icon: "network"
                    )

                    if viewModel.recognitionMode == .professionalMode {
                        StatusRow(
                            title: "WebRTC",
                            isConnected: viewModel.webRTCConnected,
                            icon: "waveform.circle"
                        )
                    }
                }

                // Audio Features Section
                Section("Audio Features") {
                    Toggle("Wake Word Detection", isOn: Binding(
                        get: { viewModel.wakeWordEnabled },
                        set: { newValue in
                            if newValue {
                                Task {
                                    await viewModel.startWakeWordDetection()
                                }
                            } else {
                                viewModel.stopWakeWordDetection()
                            }
                        }
                    ))

                    Toggle("Voice Activity Detection", isOn: Binding(
                        get: { viewModel.vadEnabled },
                        set: { newValue in
                            if newValue {
                                viewModel.startVAD()
                            } else {
                                viewModel.stopVAD()
                            }
                        }
                    ))

                    if viewModel.vadLatency > 0 {
                        HStack {
                            Text("VAD Latency")
                            Spacer()
                            Text(String(format: "%.0f ms", viewModel.vadLatency))
                                .foregroundColor(.secondary)
                        }
                    }
                }

                // Session Information
                if let sessionId = viewModel.currentSessionId {
                    Section("Session") {
                        HStack {
                            Text("Session ID")
                            Spacer()
                            Text(sessionId.prefix(8) + "...")
                                .font(.system(.caption, design: .monospaced))
                                .foregroundColor(.secondary)
                        }

                        HStack {
                            Text("Status")
                            Spacer()
                            Text(viewModel.sessionStatus)
                                .foregroundColor(.secondary)
                        }
                    }
                }

                // About Section
                Section("About") {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0")
                            .foregroundColor(.secondary)
                    }

                    HStack {
                        Text("Build")
                        Spacer()
                        Text(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1")
                            .foregroundColor(.secondary)
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .onAppear {
                // Load available voices on appear
                voiceGroups = VoiceAssistantViewModel.getAvailableVoices()
            }
        }
    }

    private var selectedVoiceName: String {
        // Find the selected voice name from the identifier
        if let voice = AVSpeechSynthesisVoice(identifier: viewModel.selectedVoiceIdentifier) {
            return voice.name
        }
        return "Default"
    }
}

// MARK: - Recognition Mode Row

struct RecognitionModeRow: View {
    let mode: RecognitionMode
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: mode.icon)
                    .font(.title3)
                    .foregroundColor(isSelected ? .blue : .secondary)
                    .frame(width: 30)

                VStack(alignment: .leading, spacing: 2) {
                    Text(mode.rawValue)
                        .font(.body)
                        .foregroundColor(.primary)

                    Text(shortDescription(for: mode))
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.blue)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func shortDescription(for mode: RecognitionMode) -> String {
        switch mode {
        case .privacyMode:
            return "On-device, offline capable"
        case .standardMode:
            return "Apple cloud, best balance"
        case .professionalMode:
            return "WebRTC, best accuracy"
        }
    }
}

// MARK: - Status Row

struct StatusRow: View {
    let title: String
    let isConnected: Bool
    let icon: String

    var body: some View {
        HStack {
            Image(systemName: icon)
                .foregroundColor(.secondary)

            Text(title)

            Spacer()

            HStack(spacing: 4) {
                Circle()
                    .fill(isConnected ? Color.green : Color.gray)
                    .frame(width: 8, height: 8)

                Text(isConnected ? "Connected" : "Disconnected")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
    }
}

// MARK: - Voice Selection View

struct VoiceSelectionView: View {
    @ObservedObject var viewModel: VoiceAssistantViewModel
    let voiceGroups: [VoiceGroup]
    @Environment(\.dismiss) var dismiss

    var body: some View {
        List {
            // Info section for downloading better voices
            if hasOnlyStandardVoices {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 8) {
                            Image(systemName: "info.circle.fill")
                                .foregroundColor(.blue)
                            Text("Download Better Voices")
                                .font(.subheadline)
                                .fontWeight(.medium)
                        }

                        Text("For higher quality voices, go to Settings > Accessibility > Spoken Content > Voices and download Enhanced or Premium voices.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .padding(.vertical, 4)
                }
            }

            ForEach(voiceGroups) { group in
                Section(header: Text(group.languageName)) {
                    ForEach(group.voices, id: \.identifier) { voice in
                        VoiceRow(
                            voice: voice,
                            isSelected: voice.identifier == viewModel.selectedVoiceIdentifier,
                            action: {
                                viewModel.selectedVoiceIdentifier = voice.identifier
                                // Play a preview
                                playVoicePreview(voice: voice)
                            }
                        )
                    }
                }
            }
        }
        .navigationTitle("Select Voice")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var hasOnlyStandardVoices: Bool {
        voiceGroups.flatMap { $0.voices }.allSatisfy { $0.quality == .default }
    }

    private func playVoicePreview(voice: AVSpeechSynthesisVoice) {
        let utterance = AVSpeechUtterance(string: "Hello, I'm \(voice.name)")
        utterance.voice = voice
        utterance.rate = 0.5

        let synthesizer = AVSpeechSynthesizer()
        synthesizer.speak(utterance)
    }
}

// MARK: - Voice Row

struct VoiceRow: View {
    let voice: AVSpeechSynthesisVoice
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(voice.name)
                        .font(.body)
                        .foregroundColor(.primary)

                    HStack(spacing: 8) {
                        // Quality indicator
                        QualityBadge(quality: voice.quality)

                        // Gender indicator (if available)
                        if voice.gender != .unspecified {
                            Text(genderString(for: voice.gender))
                                .font(.caption2)
                                .foregroundColor(.secondary)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.secondary.opacity(0.1))
                                .cornerRadius(4)
                        }
                    }
                }

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.blue)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func genderString(for gender: AVSpeechSynthesisVoiceGender) -> String {
        switch gender {
        case .male: return "Male"
        case .female: return "Female"
        default: return ""
        }
    }
}

// MARK: - Quality Badge

struct QualityBadge: View {
    let quality: AVSpeechSynthesisVoiceQuality

    var body: some View {
        Text(qualityText)
            .font(.caption2)
            .fontWeight(.medium)
            .foregroundColor(qualityColor)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(qualityColor.opacity(0.1))
            .cornerRadius(4)
    }

    private var qualityText: String {
        switch quality {
        case .default: return "Standard"
        case .enhanced: return "Enhanced"
        case .premium: return "Premium"
        @unknown default: return "Unknown"
        }
    }

    private var qualityColor: Color {
        switch quality {
        case .default: return .gray
        case .enhanced: return .blue
        case .premium: return .purple
        @unknown default: return .gray
        }
    }
}

// MARK: - Preview

#Preview {
    SettingsView(viewModel: VoiceAssistantViewModel(
        audioManager: AudioManager(),
        webRTCClient: WebRTCClient(),
        grpcClient: GRPCClient(),
        authService: AuthenticationService(),
        speechRecognitionManager: SpeechRecognitionManager()
    ))
}
