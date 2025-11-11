//
//  StatusBar.swift
//  jarvis-ios
//
//  Status indicators for connection and system states
//

import SwiftUI

struct StatusBar: View {
    let wakeWordEnabled: Bool
    let voiceActivityDetected: Bool
    let webRTCConnected: Bool
    let grpcConnected: Bool
    let vadLatency: Double
    let bytesSent: Int64

    var body: some View {
        VStack(spacing: 12) {
            // Primary status indicators
            HStack(spacing: 16) {
                StatusIndicator(
                    icon: "waveform.badge.mic",
                    label: wakeWordEnabled ? "Wake word" : "Wake off",
                    color: wakeWordEnabled ? .green : .gray,
                    isActive: wakeWordEnabled
                )

                StatusIndicator(
                    icon: "waveform",
                    label: voiceActivityDetected ? "Voice" : "Silent",
                    color: voiceActivityDetected ? .red : .gray,
                    isActive: voiceActivityDetected
                )

                StatusIndicator(
                    icon: "antenna.radiowaves.left.and.right",
                    label: webRTCConnected ? "WebRTC" : "Offline",
                    color: webRTCConnected ? .blue : .gray,
                    isActive: webRTCConnected
                )

                StatusIndicator(
                    icon: "server.rack",
                    label: grpcConnected ? "gRPC" : "Offline",
                    color: grpcConnected ? .purple : .gray,
                    isActive: grpcConnected
                )
            }

            // Secondary metrics
            HStack(spacing: 20) {
                // VAD Latency
                if vadLatency > 0 {
                    MetricView(
                        icon: "timer",
                        value: String(format: "%.0fms", vadLatency),
                        label: "VAD",
                        color: vadLatency < 150 ? .green : .orange
                    )
                }

                // Data sent
                if bytesSent > 0 {
                    MetricView(
                        icon: "arrow.up.circle",
                        value: formatBytes(bytesSent),
                        label: "Sent",
                        color: .blue
                    )
                }
            }
            .font(.caption2)
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
        .background(Color.gray.opacity(0.05))
        .cornerRadius(12)
    }

    private func formatBytes(_ bytes: Int64) -> String {
        if bytes < 1024 {
            return "\(bytes)B"
        } else if bytes < 1024 * 1024 {
            return String(format: "%.1fKB", Double(bytes) / 1024.0)
        } else {
            return String(format: "%.1fMB", Double(bytes) / (1024.0 * 1024.0))
        }
    }
}

// MARK: - Status Indicator

struct StatusIndicator: View {
    let icon: String
    let label: String
    let color: Color
    let isActive: Bool

    @State private var pulseAnimation = false

    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                // Pulse effect when active
                if isActive {
                    Circle()
                        .fill(color.opacity(0.2))
                        .frame(width: 32, height: 32)
                        .scaleEffect(pulseAnimation ? 1.2 : 1.0)
                        .opacity(pulseAnimation ? 0 : 1)
                }

                // Icon
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(color)
                    .frame(width: 32, height: 32)
            }
            .onAppear {
                if isActive {
                    withAnimation(.easeOut(duration: 1.5).repeatForever(autoreverses: false)) {
                        pulseAnimation = true
                    }
                }
            }
            .onChange(of: isActive) { _, newValue in
                if newValue {
                    withAnimation(.easeOut(duration: 1.5).repeatForever(autoreverses: false)) {
                        pulseAnimation = true
                    }
                } else {
                    pulseAnimation = false
                }
            }

            Text(label)
                .font(.caption2)
                .foregroundColor(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Metric View

struct MetricView: View {
    let icon: String
    let value: String
    let label: String
    let color: Color

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption2)
                .foregroundColor(color)

            Text(value)
                .fontWeight(.semibold)
                .foregroundColor(.primary)

            Text(label)
                .foregroundColor(.secondary)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(color.opacity(0.1))
        .cornerRadius(6)
    }
}

#Preview("All Active") {
    StatusBar(
        wakeWordEnabled: true,
        voiceActivityDetected: true,
        webRTCConnected: true,
        grpcConnected: true,
        vadLatency: 120.5,
        bytesSent: 2_456_789
    )
    .padding()
}

#Preview("Partial Active") {
    StatusBar(
        wakeWordEnabled: true,
        voiceActivityDetected: false,
        webRTCConnected: true,
        grpcConnected: false,
        vadLatency: 95.2,
        bytesSent: 1024
    )
    .padding()
}

#Preview("All Inactive") {
    StatusBar(
        wakeWordEnabled: false,
        voiceActivityDetected: false,
        webRTCConnected: false,
        grpcConnected: false,
        vadLatency: 0,
        bytesSent: 0
    )
    .padding()
}
