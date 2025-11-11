//
//  WaveformView.swift
//  jarvis-ios
//
//  Real-time audio waveform visualization
//

import SwiftUI

struct WaveformView: View {
    let amplitudes: [Float]
    let isActive: Bool
    let barCount: Int

    @State private var animationPhase: Double = 0

    init(amplitudes: [Float] = [], isActive: Bool = false, barCount: Int = 50) {
        self.amplitudes = amplitudes
        self.isActive = isActive
        self.barCount = barCount
    }

    var body: some View {
        GeometryReader { geometry in
            HStack(alignment: .center, spacing: 2) {
                ForEach(0..<barCount, id: \.self) { index in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(barColor(for: index))
                        .frame(width: barWidth(for: geometry.size.width))
                        .frame(height: barHeight(for: index, maxHeight: geometry.size.height))
                        .animation(
                            .easeInOut(duration: 0.15)
                            .repeatCount(1),
                            value: amplitudes
                        )
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .onAppear {
            if isActive {
                withAnimation(.linear(duration: 1.0).repeatForever(autoreverses: false)) {
                    animationPhase = 1.0
                }
            }
        }
    }

    private func barWidth(for totalWidth: CGFloat) -> CGFloat {
        let spacing = CGFloat(barCount - 1) * 2
        return max((totalWidth - spacing) / CGFloat(barCount), 2)
    }

    private func barHeight(for index: Int, maxHeight: CGFloat) -> CGFloat {
        let amplitude: Float
        if amplitudes.indices.contains(index) {
            amplitude = amplitudes[index]
        } else if isActive {
            // Animated idle state
            let phase = Double(index) / Double(barCount) + animationPhase
            amplitude = Float(abs(sin(phase * .pi * 2))) * 0.3 + 0.1
        } else {
            amplitude = 0.1
        }

        let minHeight: CGFloat = 4
        let calculatedHeight = CGFloat(amplitude) * maxHeight * 0.8
        return max(calculatedHeight, minHeight)
    }

    private func barColor(for index: Int) -> Color {
        let amplitude: Float = amplitudes.indices.contains(index) ? amplitudes[index] : 0.1

        if !isActive {
            return Color.gray.opacity(0.3)
        } else if amplitude > 0.7 {
            return Color.red.opacity(0.9)
        } else if amplitude > 0.4 {
            return Color.orange.opacity(0.8)
        } else {
            return Color.blue.opacity(0.7)
        }
    }
}

// MARK: - Compact Waveform (for smaller spaces)

struct CompactWaveformView: View {
    let isActive: Bool
    @State private var animationPhase: Double = 0

    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<12, id: \.self) { index in
                RoundedRectangle(cornerRadius: 1)
                    .fill(isActive ? Color.blue : Color.gray.opacity(0.3))
                    .frame(width: 3)
                    .frame(height: barHeight(for: index))
            }
        }
        .onAppear {
            if isActive {
                withAnimation(.linear(duration: 1.2).repeatForever(autoreverses: false)) {
                    animationPhase = 1.0
                }
            }
        }
        .onChange(of: isActive) { _, newValue in
            if newValue {
                withAnimation(.linear(duration: 1.2).repeatForever(autoreverses: false)) {
                    animationPhase = 1.0
                }
            } else {
                animationPhase = 0.0
            }
        }
    }

    private func barHeight(for index: Int) -> CGFloat {
        if !isActive {
            return 4
        }

        let phase = Double(index) / 12.0 + animationPhase
        let height = abs(sin(phase * .pi * 2)) * 12 + 4
        return CGFloat(height)
    }
}

#Preview("Active Waveform") {
    WaveformView(
        amplitudes: (0..<50).map { _ in Float.random(in: 0.1...1.0) },
        isActive: true
    )
    .frame(height: 100)
    .padding()
}

#Preview("Inactive Waveform") {
    WaveformView(isActive: false)
        .frame(height: 100)
        .padding()
}

#Preview("Compact Waveform") {
    VStack(spacing: 20) {
        CompactWaveformView(isActive: true)
        CompactWaveformView(isActive: false)
    }
    .padding()
}
