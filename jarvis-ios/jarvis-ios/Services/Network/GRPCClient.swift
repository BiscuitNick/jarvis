//
//  GRPCClient.swift
//  jarvis-ios
//
//  gRPC client for control messages and session management
//

import Foundation
import Combine

@MainActor
class GRPCClient: ObservableObject {
    @Published var isConnected = false

    private var deviceToken: String?

    func authenticate(with token: String) async throws {
        self.deviceToken = token
        // TODO: Implement authentication
        isConnected = true
    }

    func startSession() async throws {
        // TODO: Implement session start
    }

    func stopSession() async throws {
        // TODO: Implement session stop
    }
}
