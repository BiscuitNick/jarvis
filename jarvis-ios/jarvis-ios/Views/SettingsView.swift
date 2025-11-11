//
//  SettingsView.swift
//  jarvis-ios
//
//  Settings screen for Jarvis voice assistant
//

import SwiftUI

struct SettingsView: View {
    @ObservedObject var viewModel: VoiceAssistantViewModel
    @Environment(\.dismiss) var dismiss

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

                    Toggle("Audio Visualization", isOn: $viewModel.audioVisualizationEnabled)

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
        }
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
