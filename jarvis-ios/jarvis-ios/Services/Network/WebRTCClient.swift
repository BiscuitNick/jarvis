//
//  WebRTCClient.swift
//  jarvis-ios
//
//  WebRTC client for audio streaming to backend
//

import Foundation
import Combine

@MainActor
class WebRTCClient: ObservableObject {
    @Published var connectionState: ConnectionState = .disconnected

    enum ConnectionState {
        case disconnected
        case connecting
        case connected
        case failed
    }

    func connect(to serverURL: String) async throws {
        connectionState = .connecting
        // TODO: Implement WebRTC connection
    }

    func disconnect() {
        connectionState = .disconnected
        // TODO: Implement disconnect
    }

    func sendAudio(_ audioData: Data) {
        // TODO: Implement audio streaming
    }
}
