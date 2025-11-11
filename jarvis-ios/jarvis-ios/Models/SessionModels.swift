//
//  SessionModels.swift
//  jarvis-ios
//
//  Models for session control and gRPC communication
//  Generated from session.proto
//

import Foundation

// MARK: - Configuration Models

struct AudioConfig: Codable {
    let sampleRate: Int32
    let channels: Int32
    let bitDepth: Int32
    let codec: String

    static let `default` = AudioConfig(
        sampleRate: 16000,
        channels: 1,
        bitDepth: 16,
        codec: "opus"
    )
}

struct VoiceConfig: Codable {
    let voiceId: String
    let speed: Float
    let pitch: Float
    let language: String

    static let `default` = VoiceConfig(
        voiceId: "default",
        speed: 1.0,
        pitch: 1.0,
        language: "en-US"
    )
}

// MARK: - Request Models

struct StartSessionRequest: Codable {
    let userId: String
    let audioConfig: AudioConfig
    let voiceConfig: VoiceConfig
    let metadata: [String: String]
}

struct StopSessionRequest: Codable {
    let sessionId: String
}

struct GetSessionStatusRequest: Codable {
    let sessionId: String
}

struct UpdateSessionConfigRequest: Codable {
    let sessionId: String
    let audioConfig: AudioConfig?
    let voiceConfig: VoiceConfig?
}

struct ListSessionsRequest: Codable {
    let userId: String
}

// MARK: - Response Models

struct StartSessionResponse: Codable {
    let sessionId: String
    let status: String
    let webrtcOffer: String?
    let errorMessage: String?
}

struct StopSessionResponse: Codable {
    let success: Bool
    let message: String
}

struct GetSessionStatusResponse: Codable {
    let sessionId: String
    let status: String
    let createdAt: Int64
    let updatedAt: Int64
    let expiresAt: Int64
}

struct UpdateSessionConfigResponse: Codable {
    let success: Bool
    let message: String
}

struct SessionInfo: Codable {
    let sessionId: String
    let status: String
    let createdAt: Int64
    let expiresAt: Int64
}

struct ListSessionsResponse: Codable {
    let sessions: [SessionInfo]
}

// MARK: - Session Status Enum

enum SessionStatus: String {
    case active = "active"
    case inactive = "inactive"
    case expired = "expired"
    case error = "error"
}

// MARK: - Error Models

struct GRPCError: Error, LocalizedError {
    let code: Int
    let message: String
    let details: String?

    var errorDescription: String? {
        return message
    }
}
