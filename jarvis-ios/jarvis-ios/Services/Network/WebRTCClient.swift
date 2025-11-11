//
//  WebRTCClient.swift
//  jarvis-ios
//
//  WebRTC client for audio streaming to backend
//

import Foundation
import Combine
// Note: WebRTC framework will be added via Swift Package Manager
// import WebRTC

@MainActor
class WebRTCClient: ObservableObject {
    @Published var connectionState: ConnectionState = .disconnected
    @Published var audioStreamActive = false
    @Published var bytesSent: Int64 = 0
    @Published var latencyMs: Double = 0.0

    enum ConnectionState {
        case disconnected
        case connecting
        case connected
        case failed
        case reconnecting
    }

    // WebRTC components (will be properly initialized once WebRTC framework is added)
    // private var peerConnectionFactory: RTCPeerConnectionFactory?
    // private var peerConnection: RTCPeerConnection?
    // private var audioTrack: RTCAudioTrack?
    // private var dataChannel: RTCDataChannel?

    private var signalingServerURL: String?
    private var isReconnecting = false
    private let maxReconnectAttempts = 5
    private var reconnectAttempts = 0

    // Audio configuration
    private let audioCodec = "opus"
    private let sampleRate: Int32 = 48000
    private let channels: Int32 = 1
    private let bitrate: Int32 = 32000 // 32kbps

    init() {
        setupNotifications()
    }

    private func setupNotifications() {
        // Listen for network changes
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleNetworkChange),
            name: NSNotification.Name("NetworkStatusChanged"),
            object: nil
        )
    }

    func connect(to serverURL: String) async throws {
        self.signalingServerURL = serverURL
        connectionState = .connecting

        do {
            try await establishPeerConnection(serverURL: serverURL)
            connectionState = .connected
            reconnectAttempts = 0
        } catch {
            connectionState = .failed
            throw WebRTCError.connectionFailed(error.localizedDescription)
        }
    }

    private func establishPeerConnection(serverURL: String) async throws {
        // TODO: Implement when WebRTC framework is added
        // 1. Create RTCPeerConnectionFactory with audio-only configuration
        // 2. Set up audio constraints (Opus codec, sample rate, channels)
        // 3. Create RTCPeerConnection with ICE servers
        // 4. Create audio track from microphone
        // 5. Add audio track to peer connection
        // 6. Create data channel for control messages
        // 7. Handle signaling (offer/answer, ICE candidates)

        print("Establishing peer connection to: \(serverURL)")

        // Simulate connection for now
        try await Task.sleep(nanoseconds: 500_000_000) // 0.5 seconds
    }

    func disconnect() {
        audioStreamActive = false
        // closePeerConnection()
        connectionState = .disconnected
        print("WebRTC connection closed")
    }

    func startAudioStream() throws {
        guard connectionState == .connected else {
            throw WebRTCError.notConnected
        }

        // TODO: Start capturing and streaming audio
        audioStreamActive = true
        print("Audio streaming started - Codec: \(audioCodec), Sample Rate: \(sampleRate)Hz, Bitrate: \(bitrate)bps")
    }

    func stopAudioStream() {
        audioStreamActive = false
        print("Audio streaming stopped")
    }

    func sendAudioBuffer(_ buffer: Data) {
        guard audioStreamActive, connectionState == .connected else {
            return
        }

        // TODO: Send audio buffer via peer connection audio track
        bytesSent += Int64(buffer.count)
    }

    func sendControlMessage(_ message: [String: Any]) throws {
        guard connectionState == .connected else {
            throw WebRTCError.notConnected
        }

        // TODO: Send via data channel when WebRTC is integrated
        guard let jsonData = try? JSONSerialization.data(withJSONObject: message) else {
            throw WebRTCError.invalidMessage
        }

        print("Sending control message: \(message)")
        // dataChannel?.sendData(RTCDataBuffer(data: jsonData, isBinary: false))
    }

    @objc private func handleNetworkChange() {
        guard connectionState == .connected else { return }

        Task { @MainActor in
            await attemptReconnect()
        }
    }

    private func attemptReconnect() async {
        guard !isReconnecting,
              reconnectAttempts < maxReconnectAttempts,
              let serverURL = signalingServerURL else {
            return
        }

        isReconnecting = true
        connectionState = .reconnecting
        reconnectAttempts += 1

        print("Attempting reconnect (\(reconnectAttempts)/\(maxReconnectAttempts))...")

        do {
            // Exponential backoff
            let delay = min(pow(2.0, Double(reconnectAttempts)), 30.0)
            try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))

            try await establishPeerConnection(serverURL: serverURL)
            connectionState = .connected
            reconnectAttempts = 0
            print("Reconnection successful")
        } catch {
            print("Reconnection failed: \(error)")
            if reconnectAttempts >= maxReconnectAttempts {
                connectionState = .failed
                print("Max reconnect attempts reached")
            }
        }

        isReconnecting = false
    }

    // MARK: - Statistics
    func getConnectionStats() -> ConnectionStats {
        ConnectionStats(
            connectionState: connectionState,
            audioStreamActive: audioStreamActive,
            bytesSent: bytesSent,
            latencyMs: latencyMs,
            reconnectAttempts: reconnectAttempts
        )
    }

    struct ConnectionStats {
        let connectionState: ConnectionState
        let audioStreamActive: Bool
        let bytesSent: Int64
        let latencyMs: Double
        let reconnectAttempts: Int
    }

    enum WebRTCError: Error {
        case connectionFailed(String)
        case notConnected
        case invalidMessage
        case codecNotSupported
        case audioCaptureFailed
    }
}

// MARK: - WebRTC Configuration Extensions
extension WebRTCClient {
    private func createAudioConstraints() -> [String: Any] {
        // TODO: Return proper RTCMediaConstraints when WebRTC is added
        return [
            "googEchoCancellation": "true",
            "googAutoGainControl": "true",
            "googNoiseSuppression": "true",
            "googHighpassFilter": "true",
            "googAudioMirroring": "false"
        ]
    }

    private func getPreferredCodec() -> String {
        // Opus is preferred for voice due to low latency and good quality
        return "opus/48000/2"
    }
}
