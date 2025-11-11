//
//  AuthenticationService.swift
//  jarvis-ios
//
//  Device authentication and token management
//

import Foundation
import Security
import Combine

@MainActor
class AuthenticationService: ObservableObject {
    @Published var isAuthenticated = false

    private let keychainService = "com.jarvis.devicetoken"

    func getDeviceToken() -> String? {
        // TODO: Retrieve from Keychain
        return retrieveFromKeychain(key: "deviceToken")
    }

    func saveDeviceToken(_ token: String) throws {
        // TODO: Save to Keychain
        try saveToKeychain(key: "deviceToken", value: token)
        isAuthenticated = true
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

    enum KeychainError: Error {
        case saveFailed
    }
}
