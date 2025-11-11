//
//  ContentView.swift
//  jarvis-ios
//
//  Main view for Jarvis voice assistant
//

import SwiftUI

struct ContentView: View {
    @StateObject private var viewModel: VoiceAssistantViewModel

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
        VStack(spacing: 20) {
            Text("Jarvis")
                .font(.largeTitle)
                .fontWeight(.bold)

            // Status Indicators
            VStack(spacing: 8) {
                HStack(spacing: 20) {
                    // Wake Word Status
                    HStack {
                        Circle()
                            .fill(viewModel.wakeWordEnabled ? Color.green : Color.gray)
                            .frame(width: 12, height: 12)
                        Text(viewModel.wakeWordEnabled ? "Wake word" : "Wake off")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    // VAD Status
                    HStack {
                        Circle()
                            .fill(viewModel.voiceActivityDetected ? Color.red : Color.gray)
                            .frame(width: 12, height: 12)
                        Text(viewModel.voiceActivityDetected ? "Voice" : "Silent")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    // WebRTC Status
                    HStack {
                        Circle()
                            .fill(viewModel.webRTCConnected ? Color.blue : Color.gray)
                            .frame(width: 12, height: 12)
                        Text(viewModel.webRTCConnected ? "WebRTC" : "Offline")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }

                // Data sent indicator
                if viewModel.bytesSent > 0 {
                    Text(String(format: "Sent: %.1f KB", Double(viewModel.bytesSent) / 1024.0))
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }

            // VAD Latency Display
            if viewModel.vadLatency > 0 {
                Text(String(format: "VAD Latency: %.1fms", viewModel.vadLatency))
                    .font(.caption2)
                    .foregroundColor(viewModel.vadLatency < 150 ? .green : .orange)
            }

            // Transcript Display
            ScrollView {
                Text(viewModel.transcript.isEmpty ? "Say 'Jarvis' to activate..." : viewModel.transcript)
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: 300)
            .background(Color.gray.opacity(0.1))
            .cornerRadius(10)

            VStack(spacing: 10) {
                // Wake Word Toggle
                Toggle("Enable Wake Word Detection", isOn: Binding(
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

                // VAD Toggle
                Button(action: {
                    if viewModel.voiceActivityDetected {
                        viewModel.stopVAD()
                    } else {
                        viewModel.startVAD()
                    }
                }) {
                    HStack {
                        Text("Test Voice Activity Detection")
                        Image(systemName: viewModel.voiceActivityDetected ? "waveform" : "waveform.slash")
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue.opacity(0.1))
                    .cornerRadius(8)
                }

                // WebRTC Connection Toggle
                Button(action: {
                    if viewModel.webRTCConnected {
                        viewModel.disconnectWebRTC()
                    } else {
                        Task {
                            await viewModel.connectWebRTC()
                        }
                    }
                }) {
                    HStack {
                        Text(viewModel.webRTCConnected ? "Disconnect WebRTC" : "Connect WebRTC")
                        Image(systemName: viewModel.webRTCConnected ? "antenna.radiowaves.left.and.right" : "antenna.radiowaves.left.and.right.slash")
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(viewModel.webRTCConnected ? Color.green.opacity(0.1) : Color.gray.opacity(0.1))
                    .cornerRadius(8)
                }

                // Audio Streaming Toggle
                if viewModel.webRTCConnected {
                    Button(action: {
                        if viewModel.audioStreamActive {
                            viewModel.stopAudioStreaming()
                        } else {
                            viewModel.startAudioStreaming()
                        }
                    }) {
                        HStack {
                            Text(viewModel.audioStreamActive ? "Stop Streaming" : "Start Streaming")
                            Image(systemName: viewModel.audioStreamActive ? "speaker.wave.3" : "speaker.slash")
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(viewModel.audioStreamActive ? Color.red.opacity(0.1) : Color.gray.opacity(0.1))
                        .cornerRadius(8)
                    }
                }
            }
            .padding(.horizontal)

            // Microphone Button
            Button(action: {
                if viewModel.isListening {
                    viewModel.stopListening()
                } else {
                    viewModel.startListening()
                }
            }) {
                Image(systemName: viewModel.isListening ? "mic.fill" : "mic")
                    .font(.system(size: 60))
                    .foregroundColor(viewModel.isListening ? .red : .blue)
            }
            .padding()

            Text(viewModel.isListening ? "Listening..." : "Tap to speak")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding()
        .task {
            do {
                try await viewModel.authenticate()
            } catch {
                print("Authentication failed: \(error)")
            }
        }
    }
}

#Preview {
    ContentView()
}
