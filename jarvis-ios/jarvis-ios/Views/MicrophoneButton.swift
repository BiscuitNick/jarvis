//
//  MicrophoneButton.swift
//  jarvis-ios
//
//  Animated microphone button with visual feedback
//

import SwiftUI

struct MicrophoneButton: View {
    let isListening: Bool
    let isActive: Bool
    let action: () -> Void

    @State private var pulseAnimation = false
    @State private var scaleAnimation = false

    var body: some View {
        ZStack {
            // Pulse rings
            if isListening {
                ForEach(0..<3) { index in
                    Circle()
                        .stroke(Color.red.opacity(0.3), lineWidth: 2)
                        .scaleEffect(pulseAnimation ? 1.8 : 1.0)
                        .opacity(pulseAnimation ? 0 : 1)
                        .animation(
                            .easeOut(duration: 1.5)
                            .repeatForever(autoreverses: false)
                            .delay(Double(index) * 0.5),
                            value: pulseAnimation
                        )
                }
            }

            // Main button background
            Circle()
                .fill(
                    LinearGradient(
                        colors: isListening ? [Color.red, Color.red.opacity(0.8)] : [Color.blue, Color.blue.opacity(0.8)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 80, height: 80)
                .shadow(
                    color: isListening ? Color.red.opacity(0.4) : Color.blue.opacity(0.4),
                    radius: 15,
                    x: 0,
                    y: 5
                )
                .scaleEffect(scaleAnimation ? 1.05 : 1.0)

            // Microphone icon
            Image(systemName: isListening ? "mic.fill" : "mic")
                .font(.system(size: 36, weight: .medium))
                .foregroundColor(.white)
                .scaleEffect(scaleAnimation ? 1.1 : 1.0)

            // Active indicator (small waveform inside button)
            if isActive {
                VStack {
                    Spacer()
                    CompactWaveformView(isActive: true)
                        .frame(height: 16)
                        .padding(.bottom, 8)
                }
                .frame(width: 80, height: 80)
            }
        }
        .frame(width: 100, height: 100)
        .contentShape(Circle())
        .onTapGesture {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                scaleAnimation.toggle()
            }

            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                    scaleAnimation.toggle()
                }
            }

            action()
        }
        .onAppear {
            if isListening {
                pulseAnimation = true
            }
        }
        .onChange(of: isListening) { _, newValue in
            pulseAnimation = newValue
        }
    }
}

// MARK: - Microphone Button with Label

struct LabeledMicrophoneButton: View {
    let isListening: Bool
    let isActive: Bool
    let action: () -> Void

    var body: some View {
        MicrophoneButton(
            isListening: isListening,
            isActive: isActive,
            action: action
        )
    }
}

#Preview("Listening State") {
    ZStack {
        Color.black.opacity(0.9).ignoresSafeArea()

        MicrophoneButton(
            isListening: true,
            isActive: true,
            action: {}
        )
    }
}

#Preview("Idle State") {
    ZStack {
        Color.black.opacity(0.9).ignoresSafeArea()

        MicrophoneButton(
            isListening: false,
            isActive: false,
            action: {}
        )
    }
}

#Preview("With Label") {
    ZStack {
        Color.black.opacity(0.9).ignoresSafeArea()

        VStack {
            LabeledMicrophoneButton(
                isListening: true,
                isActive: true,
                action: {}
            )
        }
    }
}
