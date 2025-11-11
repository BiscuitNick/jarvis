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

            // Transcript Display
            ScrollView {
                Text(viewModel.transcript.isEmpty ? "Waiting..." : viewModel.transcript)
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: 300)
            .background(Color.gray.opacity(0.1))
            .cornerRadius(10)

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
