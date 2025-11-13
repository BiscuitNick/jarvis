//
//  LiveTranscriptView.swift
//  jarvis-ios
//
//  Real-time transcript display for ongoing speech
//

import SwiftUI

struct LiveTranscriptView: View {
    let transcript: String
    let isListening: Bool
    var silenceDetectionActive: Bool = false

    @State private var pulseOpacity: Double = 0.7

    var body: some View {
        if isListening && !transcript.isEmpty {
            HStack(alignment: .top, spacing: 12) {
                // Animated microphone icon
                Image(systemName: "mic.fill")
                    .foregroundColor(.blue)
                    .font(.system(size: 16))
                    .opacity(pulseOpacity)
                    .animation(
                        Animation.easeInOut(duration: 0.8)
                            .repeatForever(autoreverses: true),
                        value: pulseOpacity
                    )
                    .onAppear {
                        pulseOpacity = 1.0
                    }

                // Live transcript text
                VStack(alignment: .leading, spacing: 4) {
                    Text("Listening...")
                        .font(.caption)
                        .foregroundColor(.secondary)

                    Text(transcript)
                        .font(.body)
                        .foregroundColor(.primary.opacity(0.9))
                        .fixedSize(horizontal: false, vertical: true)
                        .animation(.easeInOut(duration: 0.2), value: transcript)

                    // Visual indicator that this is live
                    HStack(spacing: 4) {
                        if silenceDetectionActive {
                            // Show pause indicator when detecting silence
                            Image(systemName: "pause.circle.fill")
                                .foregroundColor(.orange)
                                .font(.caption)

                            Text("Detecting silence...")
                                .font(.caption2)
                                .foregroundColor(.orange)
                        } else {
                            Circle()
                                .fill(Color.red)
                                .frame(width: 6, height: 6)

                            Text("Live transcription")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                    }
                    .animation(.easeInOut, value: silenceDetectionActive)
                }

                Spacer()
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.blue.opacity(0.08))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.blue.opacity(0.3), lineWidth: 1)
                    )
            )
            .transition(
                .asymmetric(
                    insertion: .move(edge: .bottom).combined(with: .opacity),
                    removal: .move(edge: .top).combined(with: .opacity)
                )
            )
        }
    }
}

// MARK: - Alternative Compact Style

struct CompactLiveTranscriptView: View {
    let transcript: String
    let isListening: Bool

    var body: some View {
        if isListening && !transcript.isEmpty {
            HStack(spacing: 8) {
                // Animated wave indicator
                WaveformIndicator()
                    .frame(width: 20, height: 16)

                // Scrolling text
                ScrollView(.horizontal, showsIndicators: false) {
                    Text(transcript)
                        .font(.callout)
                        .foregroundColor(.primary)
                        .lineLimit(1)
                }

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                Capsule()
                    .fill(Color.blue.opacity(0.1))
                    .overlay(
                        Capsule()
                            .stroke(Color.blue.opacity(0.3), lineWidth: 1)
                    )
            )
            .transition(.scale.combined(with: .opacity))
        }
    }
}

// MARK: - Waveform Animation

struct WaveformIndicator: View {
    @State private var animating = false

    var body: some View {
        HStack(spacing: 2) {
            ForEach(0..<3) { index in
                RoundedRectangle(cornerRadius: 2)
                    .fill(Color.blue)
                    .frame(width: 3)
                    .scaleEffect(y: animating ? 1.0 : 0.5, anchor: .center)
                    .animation(
                        Animation.easeInOut(duration: 0.6)
                            .repeatForever(autoreverses: true)
                            .delay(Double(index) * 0.2),
                        value: animating
                    )
            }
        }
        .onAppear {
            animating = true
        }
    }
}

#Preview("Live Transcript") {
    VStack(spacing: 20) {
        LiveTranscriptView(
            transcript: "What's the weather like today in San Francisco?",
            isListening: true
        )

        CompactLiveTranscriptView(
            transcript: "Tell me about artificial intelligence and machine learning",
            isListening: true
        )
    }
    .padding()
    .background(Color.black.opacity(0.9))
}

#Preview("Empty State") {
    VStack {
        LiveTranscriptView(
            transcript: "",
            isListening: true
        )

        CompactLiveTranscriptView(
            transcript: "",
            isListening: false
        )
    }
    .padding()
    .background(Color.black.opacity(0.9))
}