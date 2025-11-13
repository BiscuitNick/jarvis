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
    @State private var showConversationHistory = false

    init(authService: AuthenticationService) {
        let audioManager = AudioManager()
        let webRTCClient = WebRTCClient()
        let grpcClient = GRPCClient()
        let speechRecognitionManager = SpeechRecognitionManager()
        let conversationManager = ConversationManager.shared

        _viewModel = StateObject(wrappedValue: VoiceAssistantViewModel(
            audioManager: audioManager,
            webRTCClient: webRTCClient,
            grpcClient: grpcClient,
            authService: authService,
            speechRecognitionManager: speechRecognitionManager,
            conversationManager: conversationManager
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
                                // Note: Message is already added by the speech recognition callback
                                // when the transcript is final, and the backend response is handled
                                // automatically via sendTranscriptToBackend()
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
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: { showConversationHistory.toggle() }) {
                        Image(systemName: "message")
                            .foregroundColor(.white)
                    }
                }
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
            .sheet(isPresented: $showConversationHistory) {
                ConversationHistoryView(
                    conversationManager: viewModel.conversationManager,
                    viewModel: viewModel
                )
            }
            .task {
                // Run initialization in background without blocking UI
                Task.detached(priority: .userInitiated) {
                    do {
                        // Request speech recognition permissions
                        let speechAuthorized = await viewModel.requestSpeechPermissions()
                        await MainActor.run {
                            if speechAuthorized {
                                print("✅ Speech recognition authorized")
                            } else {
                                print("❌ Speech recognition not authorized")
                                viewModel.addSystemMessage("Speech recognition requires microphone permissions")
                            }
                        }

                        // Authenticate with backend
                        try await viewModel.authenticate()
                        await MainActor.run {
                            viewModel.addSystemMessage("System initialized. Ready to use.")
                        }
                    } catch {
                        print("Authentication failed: \(error)")
                        await MainActor.run {
                            viewModel.addSystemMessage("Authentication failed: \(error.localizedDescription)")
                        }
                    }
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}

// MARK: - Recognition Mode Indicator

struct RecognitionModeIndicator: View {
    let mode: RecognitionMode

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: mode.icon)
                .font(.caption2)

            Text(modeName)
                .font(.caption2)
                .fontWeight(.medium)
        }
        .foregroundColor(.white.opacity(0.7))
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(Color.white.opacity(0.1))
        .cornerRadius(12)
    }

    private var modeName: String {
        switch mode {
        case .privacyMode: return "Privacy"
        case .standardMode: return "Standard"
        case .professionalMode: return "Pro"
        }
    }
}

#Preview {
    ContentView(authService: AuthenticationService())
}
