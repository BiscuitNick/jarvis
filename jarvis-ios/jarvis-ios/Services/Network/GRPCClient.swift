//
//  GRPCClient.swift
//  jarvis-ios
//
//  gRPC client for control messages and session management
//

import Foundation
import Combine

enum GRPCClientError: Error {
    case notAuthenticated
    case invalidURL
    case networkError(Error)
    case invalidResponse
    case serverError(String)
}

@MainActor
class GRPCClient: ObservableObject {
    @Published var isConnected = false
    @Published var currentSessionId: String?

    private var deviceToken: String?
    private var userId: String?
    private let baseURL: String
    private let session: URLSession

    // Connection retry configuration
    private let maxRetries = 3
    private let retryDelay: TimeInterval = 2.0

    init(baseURL: String = "http://10.10.0.44:50051") {
        self.baseURL = baseURL

        // Configure URLSession for HTTP/2 and gRPC
        let configuration = URLSessionConfiguration.default
        configuration.httpAdditionalHeaders = [
            "Content-Type": "application/grpc+json",
            "Accept": "application/grpc+json"
        ]
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 60
        configuration.httpMaximumConnectionsPerHost = 5

        self.session = URLSession(configuration: configuration)
    }

    // MARK: - Authentication

    func authenticate(with token: String, userId: String) async throws {
        self.deviceToken = token
        self.userId = userId
        isConnected = true
        print("✅ GRPCClient authenticated for user: \(userId)")
    }

    func disconnect() {
        deviceToken = nil
        userId = nil
        currentSessionId = nil
        isConnected = false
        print("🔌 GRPCClient disconnected")
    }

    // MARK: - Session Control Methods

    /// Start a new session with the backend
    func startSession(
        audioConfig: AudioConfig = .default,
        voiceConfig: VoiceConfig = .default,
        metadata: [String: String] = [:]
    ) async throws -> StartSessionResponse {
        guard let userId = userId else {
            throw GRPCClientError.notAuthenticated
        }

        let request = StartSessionRequest(
            userId: userId,
            audioConfig: audioConfig,
            voiceConfig: voiceConfig,
            metadata: metadata
        )

        let response: StartSessionResponse = try await performRequest(
            endpoint: "/jarvis.ingress.SessionControl/StartSession",
            request: request
        )

        if let sessionId = response.sessionId as String?, !sessionId.isEmpty {
            self.currentSessionId = sessionId
            print("✅ Session started: \(sessionId)")
        }

        return response
    }

    /// Stop an active session
    func stopSession(sessionId: String? = nil) async throws -> StopSessionResponse {
        let targetSessionId = sessionId ?? currentSessionId
        guard let sessionId = targetSessionId else {
            throw GRPCClientError.serverError("No active session to stop")
        }

        let request = StopSessionRequest(sessionId: sessionId)

        let response: StopSessionResponse = try await performRequest(
            endpoint: "/jarvis.ingress.SessionControl/StopSession",
            request: request
        )

        if response.success {
            if self.currentSessionId == sessionId {
                self.currentSessionId = nil
            }
            print("✅ Session stopped: \(sessionId)")
        }

        return response
    }

    /// Get the status of a session
    func getSessionStatus(sessionId: String? = nil) async throws -> GetSessionStatusResponse {
        let targetSessionId = sessionId ?? currentSessionId
        guard let sessionId = targetSessionId else {
            throw GRPCClientError.serverError("No session ID provided")
        }

        let request = GetSessionStatusRequest(sessionId: sessionId)

        let response: GetSessionStatusResponse = try await performRequest(
            endpoint: "/jarvis.ingress.SessionControl/GetSessionStatus",
            request: request
        )

        return response
    }

    /// Update session configuration
    func updateSessionConfig(
        sessionId: String? = nil,
        audioConfig: AudioConfig? = nil,
        voiceConfig: VoiceConfig? = nil
    ) async throws -> UpdateSessionConfigResponse {
        let targetSessionId = sessionId ?? currentSessionId
        guard let sessionId = targetSessionId else {
            throw GRPCClientError.serverError("No session ID provided")
        }

        let request = UpdateSessionConfigRequest(
            sessionId: sessionId,
            audioConfig: audioConfig,
            voiceConfig: voiceConfig
        )

        let response: UpdateSessionConfigResponse = try await performRequest(
            endpoint: "/jarvis.ingress.SessionControl/UpdateSessionConfig",
            request: request
        )

        if response.success {
            print("✅ Session config updated: \(sessionId)")
        }

        return response
    }

    /// List all sessions for the current user
    func listSessions() async throws -> ListSessionsResponse {
        guard let userId = userId else {
            throw GRPCClientError.notAuthenticated
        }

        let request = ListSessionsRequest(userId: userId)

        let response: ListSessionsResponse = try await performRequest(
            endpoint: "/jarvis.ingress.SessionControl/ListSessions",
            request: request
        )

        return response
    }

    // MARK: - Private Helper Methods

    private func performRequest<T: Encodable, R: Decodable>(
        endpoint: String,
        request: T,
        retryCount: Int = 0
    ) async throws -> R {
        guard let url = URL(string: baseURL + endpoint) else {
            throw GRPCClientError.invalidURL
        }

        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"

        // Add authentication header if available
        if let token = deviceToken {
            urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        // Encode request body
        do {
            let encoder = JSONEncoder()
            encoder.keyEncodingStrategy = .convertToSnakeCase
            urlRequest.httpBody = try encoder.encode(request)
        } catch {
            throw GRPCClientError.networkError(error)
        }

        // Perform request with retry logic
        do {
            let (data, response) = try await session.data(for: urlRequest)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw GRPCClientError.invalidResponse
            }

            // Check for HTTP errors
            guard (200...299).contains(httpResponse.statusCode) else {
                if httpResponse.statusCode >= 500 && retryCount < maxRetries {
                    // Retry on server errors
                    try await Task.sleep(nanoseconds: UInt64(retryDelay * 1_000_000_000))
                    return try await performRequest(
                        endpoint: endpoint,
                        request: request,
                        retryCount: retryCount + 1
                    )
                }

                let errorMessage = String(data: data, encoding: .utf8) ?? "Unknown error"
                throw GRPCClientError.serverError("HTTP \(httpResponse.statusCode): \(errorMessage)")
            }

            // Decode response
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            let decodedResponse = try decoder.decode(R.self, from: data)

            return decodedResponse

        } catch let error as GRPCClientError {
            throw error
        } catch {
            // Retry on network errors
            if retryCount < maxRetries {
                try await Task.sleep(nanoseconds: UInt64(retryDelay * 1_000_000_000))
                return try await performRequest(
                    endpoint: endpoint,
                    request: request,
                    retryCount: retryCount + 1
                )
            }
            throw GRPCClientError.networkError(error)
        }
    }
}
