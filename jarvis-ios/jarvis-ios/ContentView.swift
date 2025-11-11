//
//  ContentView.swift
//  jarvis-ios
//
//  Main view for Jarvis voice assistant
//

import SwiftUI

struct ContentView: View {
    @StateObject private var viewModel: VoiceAssistantViewModel
    @State private var showSettings = false

    init() {
        let audioManager = AudioManager()
        let webRTCClient = WebRTCClient()
        let grpcClient = GRPCClient()
        let authService = AuthenticationService()

        _viewModel = StateObject(wrappedValue: VoiceAssistantViewModel(
            audioManager: audioManager,
            webRTCClient: webRTCClient,
            grpcClient: grpcClient,
            authService: authService
        ))
    }

    var body: some View {
        NavigationView {
            ZStack {
                // Background gradient
                LinearGradient(
                    colors: [Color.black, Color.black.opacity(0.95)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()

                VStack(spacing: 0) {
                    // Status Bar
                    StatusBar(
                        wakeWordEnabled: viewModel.wakeWordEnabled,
                        voiceActivityDetected: viewModel.voiceActivityDetected,
                        webRTCConnected: viewModel.webRTCConnected,
                        grpcConnected: viewModel.grpcConnected,
                        vadLatency: viewModel.vadLatency,
                        bytesSent: viewModel.bytesSent
                    )
                    .padding(.horizontal)
                    .padding(.top, 8)

                    // Waveform Visualization
                    WaveformView(
                        amplitudes: viewModel.audioAmplitudes,
                        isActive: viewModel.audioStreamActive || viewModel.isListening
                    )
                    .frame(height: 80)
                    .padding(.horizontal)
                    .padding(.vertical, 12)

                    // Transcript Area
                    TranscriptView(
                        messages: viewModel.messages,
                        isStreaming: viewModel.isStreaming
                    )
                    .background(Color.white.opacity(0.05))
                    .cornerRadius(16)
                    .padding(.horizontal)
                    .padding(.bottom, 12)

                    Spacer()

                    // Microphone Button
                    LabeledMicrophoneButton(
                        isListening: viewModel.isListening,
                        isActive: viewModel.wakeWordEnabled || viewModel.audioStreamActive,
                        action: {
                            if viewModel.isListening {
                                viewModel.stopListening()
                                viewModel.addUserMessage(viewModel.transcript)

                                // Simulate assistant response for testing
                                Task {
                                    viewModel.startStreaming()
                                    try? await Task.sleep(for: .seconds(1))
                                    viewModel.addAssistantMessage(
                                        "I'm processing your request. This is a test response.",
                                        sources: [
                                            Citation(
                                                title: "Example Source",
                                                url: "https://example.com",
                                                snippet: "This is a sample citation"
                                            )
                                        ]
                                    )
                                }
                            } else {
                                viewModel.startListening()
                            }
                        }
                    )
                    .padding(.bottom, 32)
                }
            }
            .navigationTitle("Jarvis")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showSettings.toggle() }) {
                        Image(systemName: "gearshape")
                            .foregroundColor(.white)
                    }
                }
            }
            .sheet(isPresented: $showSettings) {
                SettingsView(viewModel: viewModel)
            }
            .task {
                do {
                    try await viewModel.authenticate()
                    viewModel.addSystemMessage("System initialized. Ready to use.")
                } catch {
                    print("Authentication failed: \(error)")
                    viewModel.addSystemMessage("Authentication failed: \(error.localizedDescription)")
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}

// MARK: - Settings View

struct SettingsView: View {
    @ObservedObject var viewModel: VoiceAssistantViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            Form {
                Section("Audio") {
                    Toggle("Wake Word Detection", isOn: Binding(
                        get: { viewModel.wakeWordEnabled },
                        set: { enabled in
                            if enabled {
                                Task {
                                    await viewModel.startWakeWordDetection()
                                }
                            } else {
                                viewModel.stopWakeWordDetection()
                            }
                        }
                    ))

                    Button("Test Voice Activity Detection") {
                        if viewModel.voiceActivityDetected {
                            viewModel.stopVAD()
                        } else {
                            viewModel.startVAD()
                        }
                    }
                }

                Section("Connection") {
                    HStack {
                        Text("WebRTC")
                        Spacer()
                        Circle()
                            .fill(viewModel.webRTCConnected ? Color.green : Color.gray)
                            .frame(width: 12, height: 12)
                    }

                    Button(viewModel.webRTCConnected ? "Disconnect" : "Connect") {
                        if viewModel.webRTCConnected {
                            viewModel.disconnectWebRTC()
                        } else {
                            Task {
                                await viewModel.connectWebRTC()
                            }
                        }
                    }

                    if viewModel.webRTCConnected {
                        Button(viewModel.audioStreamActive ? "Stop Streaming" : "Start Streaming") {
                            if viewModel.audioStreamActive {
                                viewModel.stopAudioStreaming()
                            } else {
                                viewModel.startAudioStreaming()
                            }
                        }
                    }
                }

                Section("Session") {
                    if let sessionId = viewModel.currentSessionId {
                        HStack {
                            Text("Session ID")
                            Spacer()
                            Text(sessionId.prefix(8) + "...")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }

                        Text("Status: \(viewModel.sessionStatus)")
                    } else {
                        Text("No active session")
                            .foregroundColor(.secondary)
                    }
                }

                Section("Security") {
                    if let biometricType = viewModel.authService.getBiometricTypeString() {
                        Toggle(biometricType, isOn: Binding(
                            get: { viewModel.authService.biometricAuthEnabled },
                            set: { enabled in
                                if enabled {
                                    viewModel.authService.enableBiometricAuth()
                                } else {
                                    viewModel.authService.disableBiometricAuth()
                                }
                            }
                        ))

                        if viewModel.authService.biometricAuthEnabled {
                            Button("Test Biometric Auth") {
                                Task {
                                    do {
                                        let success = try await viewModel.authService.authenticateWithBiometrics()
                                        print(success ? "✅ Auth success" : "❌ Auth failed")
                                    } catch {
                                        print("❌ Auth error: \(error)")
                                    }
                                }
                            }
                        }
                    } else {
                        Text("Biometric authentication not available")
                            .foregroundColor(.secondary)
                    }

                    HStack {
                        Text("Device ID")
                        Spacer()
                        if let deviceId = viewModel.authService.deviceId {
                            Text(deviceId.prefix(8) + "...")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        } else {
                            Text("Not registered")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }

                    Button("Refresh Token") {
                        Task {
                            do {
                                let _ = try await viewModel.authService.refreshDeviceToken()
                            } catch {
                                print("❌ Token refresh failed: \(error)")
                            }
                        }
                    }
                }

                Section("Actions") {
                    Button("Clear Transcript", role: .destructive) {
                        viewModel.clearTranscript()
                    }

                    Button("Test Audio Visualization") {
                        viewModel.simulateAudioAmplitudes()
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

#Preview {
    ContentView()
}
