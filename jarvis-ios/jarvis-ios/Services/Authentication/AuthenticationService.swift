//
//  AuthenticationService.swift
//  jarvis-ios
//
//  Device authentication and token management
//

import Foundation
import UIKit
import Security
import LocalAuthentication
import Combine

@MainActor
class AuthenticationService: ObservableObject {
    @Published var isAuthenticated = false
    @Published var biometricAuthEnabled = false
    @Published var deviceId: String?

    private let keychainService = "com.jarvis.devicetoken"
    private let context = LAContext()

    func getDeviceToken() -> String? {
        return retrieveFromKeychain(key: "deviceToken")
    }

    func saveDeviceToken(_ token: String) throws {
        try saveToKeychain(key: "deviceToken", value: token)
        isAuthenticated = true
    }

    func getUserId() -> String? {
        return retrieveFromKeychain(key: "userId")
    }

    func saveUserId(_ userId: String) throws {
        try saveToKeychain(key: "userId", value: userId)
    }

    // MARK: - Access Token Management

    func getAccessToken() -> String? {
        return retrieveFromKeychain(key: "accessToken")
    }

    func saveAccessToken(_ token: String) throws {
        try saveToKeychain(key: "accessToken", value: token)
    }

    func getRefreshToken() -> String? {
        return retrieveFromKeychain(key: "refreshToken")
    }

    func saveRefreshToken(_ token: String) throws {
        try saveToKeychain(key: "refreshToken", value: token)
    }

    func deleteDeviceToken() throws {
        try deleteFromKeychain(key: "deviceToken")
        isAuthenticated = false
    }

    func deleteUserId() throws {
        try deleteFromKeychain(key: "userId")
    }

    func deleteAccessToken() throws {
        try deleteFromKeychain(key: "accessToken")
    }

    func deleteRefreshToken() throws {
        try deleteFromKeychain(key: "refreshToken")
    }

    // MARK: - Device Registration

    /// Generate or retrieve a unique device identifier
    func getOrCreateDeviceId() -> String {
        if let existingId = retrieveFromKeychain(key: "deviceId") {
            deviceId = existingId
            return existingId
        }

        // Generate new device ID using UIDevice identifierForVendor
        let newDeviceId = UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
        try? saveToKeychain(key: "deviceId", value: newDeviceId)
        deviceId = newDeviceId
        return newDeviceId
    }

    /// Register the device with the backend
    func registerDevice() async throws -> (deviceToken: String, userId: String) {
        let deviceId = getOrCreateDeviceId()

        // Check if we already have an access token
        if let existingToken = getAccessToken(), let existingUserId = getUserId() {
            print("✅ Already authenticated with existing token")
            return (existingToken, existingUserId)
        }

        // Call backend API to register device
        let url = AppEnvironment.apiURL(path: "/api/auth/register")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body = ["deviceIdentifier": deviceId]
        request.httpBody = try JSONEncoder().encode(body)

        print("🔐 Registering device with backend at \(url.absoluteString)...")
        let session = AppEnvironment.makeURLSession()
        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 201 else {
            throw KeychainError.registrationFailed
        }

        // Parse response
        let authResponse = try JSONDecoder().decode(AuthResponse.self, from: data)

        // ✅ Save accessToken (NOT refreshToken) for API calls
        try saveAccessToken(authResponse.accessToken)
        try saveRefreshToken(authResponse.refreshToken)
        try saveUserId(authResponse.userId)
        try saveDeviceToken(authResponse.deviceToken)

        isAuthenticated = true
        print("✅ Device registered: \(deviceId)")
        print("📱 User ID: \(authResponse.userId)")
        print("🔑 Access token stored")

        return (authResponse.accessToken, authResponse.userId)
    }

    struct AuthResponse: Codable {
        let userId: String
        let deviceToken: String
        let accessToken: String
        let refreshToken: String
        let expiresIn: String
    }

    /// Deregister the device and revoke tokens
    func deregisterDevice() async throws {
        guard let deviceId = deviceId else {
            throw KeychainError.deviceNotRegistered
        }

        // TODO: Call backend API to deregister device
        // try await backendAPI.deregisterDevice(deviceId: deviceId)

        // Clear all stored credentials
        try? deleteDeviceToken()
        try? deleteUserId()
        try? deleteAccessToken()
        try? deleteRefreshToken()
        try? deleteFromKeychain(key: "deviceId")

        isAuthenticated = false
        self.deviceId = nil

        print("🔓 Device deregistered: \(deviceId)")
    }

    // MARK: - Biometric Authentication

    /// Check if biometric authentication is available
    func checkBiometricAvailability() -> (available: Bool, type: LABiometryType) {
        var error: NSError?
        let canEvaluate = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)

        if let error = error {
            print("⚠️ Biometric check error: \(error.localizedDescription)")
        }

        return (canEvaluate, context.biometryType)
    }

    /// Enable biometric authentication
    func enableBiometricAuth() {
        let (available, type) = checkBiometricAvailability()
        guard available else {
            print("⚠️ Biometric authentication not available")
            return
        }

        biometricAuthEnabled = true
        print("✅ Biometric authentication enabled: \(type)")
    }

    /// Disable biometric authentication
    func disableBiometricAuth() {
        biometricAuthEnabled = false
        print("🔓 Biometric authentication disabled")
    }

    /// Authenticate using biometrics
    func authenticateWithBiometrics() async throws -> Bool {
        guard biometricAuthEnabled else {
            throw KeychainError.biometricNotEnabled
        }

        let (available, type) = checkBiometricAvailability()
        guard available else {
            throw KeychainError.biometricNotAvailable
        }

        let reason = getBiometricPromptMessage(for: type)

        do {
            let success = try await context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason)

            if success {
                print("✅ Biometric authentication successful")
                isAuthenticated = true
            }

            return success
        } catch let error as LAError {
            print("❌ Biometric authentication failed: \(error.localizedDescription)")
            throw KeychainError.biometricAuthFailed(error.localizedDescription)
        }
    }

    private func getBiometricPromptMessage(for type: LABiometryType) -> String {
        switch type {
        case .faceID:
            return "Authenticate with Face ID to access Jarvis"
        case .touchID:
            return "Authenticate with Touch ID to access Jarvis"
        case .opticID:
            return "Authenticate with Optic ID to access Jarvis"
        default:
            return "Authenticate to access Jarvis"
        }
    }

    /// Get biometric type as a user-friendly string
    func getBiometricTypeString() -> String? {
        let (available, type) = checkBiometricAvailability()
        guard available else { return nil }

        switch type {
        case .faceID:
            return "Face ID"
        case .touchID:
            return "Touch ID"
        case .opticID:
            return "Optic ID"
        default:
            return nil
        }
    }

    // MARK: - Token Refresh

    /// Refresh the device token
    func refreshDeviceToken() async throws -> String {
        guard getDeviceToken() != nil else {
            throw KeychainError.tokenNotFound
        }

        // TODO: Call backend API to refresh token
        // let newToken = try await backendAPI.refreshToken(oldToken: existingToken)

        // For now, generate a new token
        let newToken = UUID().uuidString
        try saveDeviceToken(newToken)

        print("🔄 Device token refreshed")
        return newToken
    }

    /// Check if token needs refresh (based on expiry)
    func shouldRefreshToken() -> Bool {
        // TODO: Implement token expiry checking
        // Check token expiration date stored in Keychain or from backend
        return false
    }

    private func saveToKeychain(key: String, value: String) throws {
        let data = value.data(using: .utf8)!
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: key,
            kSecValueData as String: data
        ]

        SecItemDelete(query as CFDictionary)
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.saveFailed
        }
    }

    private func retrieveFromKeychain(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess,
              let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            return nil
        }

        return value
    }

    private func deleteFromKeychain(key: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: key
        ]

        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.deleteFailed
        }
    }

    enum KeychainError: Error, LocalizedError {
        case saveFailed
        case deleteFailed
        case deviceNotRegistered
        case biometricNotAvailable
        case biometricNotEnabled
        case biometricAuthFailed(String)
        case tokenNotFound
        case invalidURL
        case registrationFailed

        var errorDescription: String? {
            switch self {
            case .saveFailed:
                return "Failed to save to Keychain"
            case .deleteFailed:
                return "Failed to delete from Keychain"
            case .deviceNotRegistered:
                return "Device is not registered"
            case .biometricNotAvailable:
                return "Biometric authentication is not available on this device"
            case .biometricNotEnabled:
                return "Biometric authentication is not enabled"
            case .biometricAuthFailed(let reason):
                return "Biometric authentication failed: \(reason)"
            case .tokenNotFound:
                return "Device token not found"
            case .invalidURL:
                return "Invalid backend URL"
            case .registrationFailed:
                return "Failed to register device with backend"
            }
        }
    }
}
