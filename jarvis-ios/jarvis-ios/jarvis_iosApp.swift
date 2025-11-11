//
//  jarvis_iosApp.swift
//  jarvis-ios
//
//  Jarvis iOS App Entry Point
//

import SwiftUI

@main
struct jarvis_iosApp: App {
    @StateObject private var authService = AuthenticationService()

    init() {
        // Automatically register device on first launch
        Task {
            await registerDeviceIfNeeded()
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authService)
        }
    }

    @MainActor
    private func registerDeviceIfNeeded() async {
        do {
            let (_, userId) = try await authService.registerDevice()
            print("✅ App authenticated - User ID: \(userId)")
        } catch {
            print("⚠️ Auto-registration failed: \(error.localizedDescription)")
            print("   App will retry on next launch")
        }
    }
}
