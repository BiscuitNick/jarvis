//
//  AppEnvironment.swift
//  jarvis-ios
//
//  Centralized configuration for runtime environment values.
//

import Foundation

enum AppEnvironment {
    private static let defaultBaseURL = URL(string: "http://10.10.0.44:3000")!

    /// Base URL for REST APIs (configurable via Info.plist -> API_BASE_URL).
    static var apiBaseURL: URL {
        guard let rawValue = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String,
              let url = URL(string: rawValue.trimmingCharacters(in: .whitespacesAndNewlines)),
              !rawValue.isEmpty else {
            print("⚠️ Missing API_BASE_URL in Info.plist, defaulting to \(defaultBaseURL.absoluteString)")
            return defaultBaseURL
        }
        return url
    }

    /// Convenience helper to build URLs off the configured base.
    static func apiURL(path: String) -> URL {
        guard !path.isEmpty else { return apiBaseURL }

        let normalizedPath = path.hasPrefix("/") ? path : "/\(path)"

        if var components = URLComponents(url: apiBaseURL, resolvingAgainstBaseURL: false) {
            let existingPath = components.path == "/" ? "" : components.path
            components.path = existingPath + normalizedPath
            if let url = components.url {
                return url
            }
        }

        // Fallback to string concatenation if URLComponents fails
        return URL(string: apiBaseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + normalizedPath) ?? apiBaseURL
    }

    /// Creates a URLSession configured for the current environment.
    static func makeURLSession() -> URLSession {
        guard shouldBypassCertificateValidation else {
            return URLSession(configuration: .default)
        }

        return URLSession(
            configuration: .default,
            delegate: DevelopmentCertificateBypassDelegate(hostSuffix: "ngrok-free.dev"),
            delegateQueue: nil
        )
    }

    private static var shouldBypassCertificateValidation: Bool {
        #if DEBUG
        return apiBaseURL.scheme == "https" &&
               (apiBaseURL.host?.hasSuffix("ngrok-free.dev") ?? false)
        #else
        return false
        #endif
    }
}

// MARK: - Development Helpers

private final class DevelopmentCertificateBypassDelegate: NSObject, URLSessionDelegate {
    private let hostSuffix: String

    init(hostSuffix: String) {
        self.hostSuffix = hostSuffix
    }

    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        let host = challenge.protectionSpace.host
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              host.hasSuffix(hostSuffix),
              let serverTrust = challenge.protectionSpace.serverTrust else {
            completionHandler(.performDefaultHandling, nil)
            return
        }

        print("⚠️ DEBUG: Accepting \(host) certificate for development")
        completionHandler(.useCredential, URLCredential(trust: serverTrust))
    }
}
