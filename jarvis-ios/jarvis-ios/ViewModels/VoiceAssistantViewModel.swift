//
//  VoiceAssistantViewModel.swift
//  jarvis-ios
//
//  Main ViewModel coordinating all services
//

import Foundation
import Combine
import AVFoundation

// MARK: - Recognition Mode

enum RecognitionMode: String, CaseIterable, Identifiable {
    case privacyMode = "Privacy Mode"
    case standardMode = "Standard Mode"
    case professionalMode = "Professional Mode"

    var id: String { rawValue }

    var description: String {
        switch self {
        case .privacyMode:
            return "On-device recognition. Audio never leaves your device. Works offline. Limited to 1-minute sessions."
        case .standardMode:
            return "Apple cloud recognition. Better accuracy, unlimited duration. Requires internet."
        case .professionalMode:
            return "WebRTC streaming with 3rd party STT. Best accuracy for professional use."
        }
    }

    var icon: String {
        switch self {
        case .privacyMode: return "lock.shield.fill"
        case .standardMode: return "icloud.fill"
        case .professionalMode: return "waveform.circle.fill"
        }
    }
}

@MainActor
class VoiceAssistantViewModel: ObservableObject {
    @Published var transcript = ""
    @Published var messages: [TranscriptMessage] = []
    @Published var isStreaming = false
    @Published var isListening = false
    @Published var wakeWordDetected = false
    @Published var wakeWordEnabled = false
    @Published var vadEnabled = false
    @Published var voiceActivityDetected = false
    @Published var vadLatency: Double = 0.0
    @Published var audioAmplitudes: [Float] = Array(repeating: 0.1, count: 50)
    @Published var audioVisualizationEnabled = true
    @Published var webRTCConnected = false
    @Published var audioStreamActive = false
    @Published var bytesSent: Int64 = 0
    @Published var grpcConnected = false
    @Published var currentSessionId: String?
    @Published var sessionStatus: String = "inactive"

    // Speech Recognition
    @Published var recognitionMode: RecognitionMode {
        didSet {
            UserDefaults.standard.set(recognitionMode.rawValue, forKey: "recognitionMode")
            updateRecognitionMode()
        }
    }
    @Published var isRecognizing = false
    @Published var recognitionError: String?
    @Published var silenceDetectionActive = false

    // Text-to-Speech
    @Published var selectedVoiceIdentifier: String {
        didSet {
            UserDefaults.standard.set(selectedVoiceIdentifier, forKey: "selectedVoiceIdentifier")
        }
    }

    let audioManager: AudioManager
    let webRTCClient: WebRTCClient
    let grpcClient: GRPCClient
    let authService: AuthenticationService
    let speechRecognitionManager: SpeechRecognitionManager
    let conversationManager: ConversationManager

    private var cancellables = Set<AnyCancellable>()
    private var currentTranscriptAdded = false // Track if current transcript was added to messages
    private let speechSynthesizer = AVSpeechSynthesizer() // Keep synthesizer alive for TTS

    init(
        audioManager: AudioManager,
        webRTCClient: WebRTCClient,
        grpcClient: GRPCClient,
        authService: AuthenticationService,
        speechRecognitionManager: SpeechRecognitionManager,
        conversationManager: ConversationManager
    ) {
        self.audioManager = audioManager
        self.webRTCClient = webRTCClient
        self.grpcClient = grpcClient
        self.authService = authService
        self.speechRecognitionManager = speechRecognitionManager
        self.conversationManager = conversationManager

        // Load saved recognition mode from UserDefaults
        if let savedMode = UserDefaults.standard.string(forKey: "recognitionMode"),
           let mode = RecognitionMode(rawValue: savedMode) {
            self.recognitionMode = mode
        } else {
            // Default to privacy mode for best privacy and reliability
            self.recognitionMode = .privacyMode
        }

        // Load saved voice preference or use default
        if let savedVoice = UserDefaults.standard.string(forKey: "selectedVoiceIdentifier") {
            self.selectedVoiceIdentifier = savedVoice
        } else {
            // Default to first available enhanced/premium English voice, or any English voice as fallback
            let allEnglishVoices = AVSpeechSynthesisVoice.speechVoices().filter { $0.language.starts(with: "en") }
            let enhancedVoices = allEnglishVoices.filter { $0.quality == .enhanced || $0.quality == .premium }

            if let defaultVoice = enhancedVoices.first ?? allEnglishVoices.first {
                self.selectedVoiceIdentifier = defaultVoice.identifier
            } else {
                // Ultimate fallback
                self.selectedVoiceIdentifier = "com.apple.ttsbundle.Samantha-compact"
            }
        }

        loadMessagesFromConversation()
        setupBindings()
        setupSpeechRecognition()
    }

    private func setupBindings() {
        audioManager.$isRecording
            .sink { [weak self] isRecording in
                self?.isListening = isRecording
            }
            .store(in: &cancellables)

        // Don't bind wakeWordEnabled from AudioManager
        // We manage this state explicitly through startWakeWordDetection/stopWakeWordDetection
        // to avoid confusion between user preference and detector state

        // Observe wake word detection from AudioManager's WakeWordDetector
        audioManager.wakeWordDetector.$wakeWordDetected
            .removeDuplicates() // Only trigger on changes
            .sink { [weak self] detected in
                guard let self = self else { return }
                self.wakeWordDetected = detected

                // Automatically start listening when wake word is detected (goes from false to true)
                if detected && self.wakeWordEnabled && !self.isListening {
                    print("🎯 VoiceAssistantViewModel: Wake word detected! Pausing wake word detector and starting listening...")

                    // Stop TTS immediately if it's speaking (wake word interruption)
                    if self.speechSynthesizer.isSpeaking {
                        print("🔇 Stopping TTS playback - wake word interrupted")
                        self.speechSynthesizer.stopSpeaking(at: .immediate)
                    }

                    // Temporarily stop wake word detection to avoid audio engine conflict
                    // But DON'T set wakeWordEnabled to false - that's the user preference!
                    self.audioManager.wakeWordDetector.stopListening()

                    // Start listening after a small delay to ensure audio engine is released
                    Task { @MainActor in
                        try? await Task.sleep(nanoseconds: 100_000_000) // 0.1 seconds
                        print("🎯 VoiceAssistantViewModel: Starting speech recognition...")
                        self.startListening()
                    }
                } else if detected && self.isListening {
                    print("ℹ️ VoiceAssistantViewModel: Wake word detected but already listening")
                }
            }
            .store(in: &cancellables)

        audioManager.$vadEnabled
            .sink { [weak self] enabled in
                self?.vadEnabled = enabled
            }
            .store(in: &cancellables)

        audioManager.$voiceActivityDetected
            .sink { [weak self] detected in
                self?.voiceActivityDetected = detected
            }
            .store(in: &cancellables)

        audioManager.$vadLatency
            .sink { [weak self] latency in
                self?.vadLatency = latency
            }
            .store(in: &cancellables)

        webRTCClient.$connectionState
            .sink { [weak self] state in
                self?.webRTCConnected = (state == .connected)
            }
            .store(in: &cancellables)

        webRTCClient.$audioStreamActive
            .sink { [weak self] active in
                self?.audioStreamActive = active
            }
            .store(in: &cancellables)

        webRTCClient.$bytesSent
            .sink { [weak self] bytes in
                self?.bytesSent = bytes
            }
            .store(in: &cancellables)

        grpcClient.$isConnected
            .sink { [weak self] connected in
                self?.grpcConnected = connected
            }
            .store(in: &cancellables)

        grpcClient.$currentSessionId
            .sink { [weak self] sessionId in
                self?.currentSessionId = sessionId
            }
            .store(in: &cancellables)

        // Speech recognition bindings
        speechRecognitionManager.$isRecognizing
            .sink { [weak self] recognizing in
                self?.isRecognizing = recognizing
            }
            .store(in: &cancellables)

        speechRecognitionManager.$currentTranscript
            .sink { [weak self] transcript in
                guard let self = self else { return }
                print("🔄 Transcript binding update: '\(transcript)'")
                self.transcript = transcript
            }
            .store(in: &cancellables)

        speechRecognitionManager.$recognitionError
            .sink { [weak self] error in
                self?.recognitionError = error
            }
            .store(in: &cancellables)

        // Observe silence detection state
        speechRecognitionManager.$silenceDetectionActive
            .sink { [weak self] isActive in
                self?.silenceDetectionActive = isActive
            }
            .store(in: &cancellables)
    }

    private func setupSpeechRecognition() {
        // Set up callback for transcripts
        speechRecognitionManager.onTranscript = { [weak self] transcript, isFinal in
            Task { @MainActor in
                guard let self = self else { return }

                self.transcript = transcript

                if isFinal {
                    print("📝 Final transcript (callback): \(transcript)")

                    // Only process if we have actual content and it hasn't been added yet
                    if !transcript.isEmpty && !self.currentTranscriptAdded {
                        self.addUserMessage(transcript)
                        self.currentTranscriptAdded = true

                        // Send to backend based on mode
                        if self.recognitionMode != .professionalMode {
                            // For native speech modes, send text via gRPC
                            await self.sendTranscriptToBackend(transcript)
                        }
                    } else if transcript.isEmpty {
                        print("ℹ️ Ignoring empty final transcript")
                    } else if self.currentTranscriptAdded {
                        print("ℹ️ Transcript already processed, ignoring duplicate final")
                    }
                }
            }
        }

        // Set up callback for silence detection auto-stop
        speechRecognitionManager.onSilenceDetected = { [weak self] in
            Task { @MainActor in
                guard let self = self else { return }

                print("🔕 Auto-stopping due to silence detection")

                // The speech recognition manager already finalized the transcript
                // Just stop listening and restart wake word if needed
                self.isListening = false

                // Restart wake word detection if it was enabled
                if self.wakeWordEnabled {
                    Task { @MainActor in
                        try? await Task.sleep(nanoseconds: 500_000_000) // 0.5 seconds
                        await self.startWakeWordDetection()
                    }
                }
            }
        }

        // Apply initial recognition mode
        updateRecognitionMode()
    }

    private func updateRecognitionMode() {
        switch recognitionMode {
        case .privacyMode:
            speechRecognitionManager.setRecognitionMode(onDevice: true)
            print("🔒 Recognition mode: Privacy (on-device)")

        case .standardMode:
            speechRecognitionManager.setRecognitionMode(onDevice: false)
            print("☁️ Recognition mode: Standard (Apple cloud)")

        case .professionalMode:
            print("💼 Recognition mode: Professional (WebRTC)")
        }
    }

    private func sendTranscriptToBackend(_ transcript: String) async {
        print("📤 Sending transcript to backend: \(transcript)")

        do {
            // DISABLED AUTH - Using dummy token for testing
            let accessToken = "dummy-token-for-testing"
            print("⚠️ Auth disabled - using test token")

            // Call LLM Router API
            let url = AppEnvironment.apiURL(path: "/complete")

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            // DEBUG: First check what's in the local messages array
            print("🔍 Local messages array has \(messages.count) messages")
            for (index, msg) in messages.enumerated() {
                print("  Local Message \(index): [\(msg.role)] \(String(msg.text.prefix(50)))...")
            }

            // Get conversation history (last 25 messages for context)
            let conversationHistory = getMessagesForLLM()

            // Convert to format expected by LLM Router (/complete endpoint)
            var allMessages = conversationHistory.map { message -> [String: Any] in
                let role: String
                switch message.role {
                case .user: role = "user"
                case .assistant: role = "assistant"
                case .system: role = "system"
                }
                return [
                    "role": role,
                    "content": message.text
                ]
            }

            // Add current user message
            allMessages.append([
                "role": "user",
                "content": transcript
            ])

            let body: [String: Any] = [
                "messages": allMessages,
                "temperature": 0.7,
                "maxTokens": 1000
                // Backend will auto-classify intent to enable RAG for critical queries
            ]
            let jsonData = try JSONSerialization.data(withJSONObject: body)
            request.httpBody = jsonData

            // Debug: Print the actual JSON being sent
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                print("📤 Full JSON Request Body:")
                print(jsonString)
            }

            print("🌐 Calling LLM Router at \(url.absoluteString)...")
            print("📜 Including \(allMessages.count) messages in request")
            let session = AppEnvironment.makeURLSession()
            let (data, response) = try await session.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                print("❌ Invalid response")
                return
            }

            print("📡 Response status: \(httpResponse.statusCode)")

            guard httpResponse.statusCode == 200 else {
                if let errorText = String(data: data, encoding: .utf8) {
                    print("❌ API error: \(errorText)")
                }
                addSystemMessage("Error: Failed to get response")
                return
            }

            // Parse response
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            guard let content = json?["content"] as? String else {
                print("❌ No content in response")
                return
            }

            print("✅ Got response: \(content)")

            // Parse sources/citations if available
            var citations: [Citation]? = nil
            if let sources = json?["sources"] as? [[String: Any]], !sources.isEmpty {
                citations = sources.compactMap { sourceDict in
                    guard let url = sourceDict["url"] as? String ?? sourceDict["source"] as? String else {
                        return nil
                    }
                    return Citation(
                        title: sourceDict["title"] as? String ?? "Source",
                        url: url,
                        snippet: sourceDict["excerpt"] as? String ?? sourceDict["snippet"] as? String
                    )
                }
                print("📚 Retrieved \(citations?.count ?? 0) citations")
            }

            // Log grounding info if available
            if let isGrounded = json?["isGrounded"] as? Bool {
                let confidence = json?["groundingConfidence"] as? Double ?? 0.0
                print("🎯 Response grounding: \(isGrounded) (confidence: \(String(format: "%.2f", confidence)))")
            }

            // Add to messages with citations
            addAssistantMessage(content, sources: citations)

            // Speak the response using iOS native TTS
            speakText(content)

        } catch {
            print("❌ Error sending transcript: \(error)")
            addSystemMessage("Error: \(error.localizedDescription)")
        }
    }

    private func speakText(_ text: String) {
        // Ensure audio session supports playback
        let audioSession = AVAudioSession.sharedInstance()
        do {
            // Verify we're in playAndRecord mode for TTS to work
            if audioSession.category != .playAndRecord {
                print("⚠️ TTS: Audio session not in playAndRecord mode, fixing...")
                try audioSession.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetoothA2DP, .mixWithOthers])
            }
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
            print("🔊 TTS: Audio session ready (category: \(audioSession.category.rawValue))")
        } catch {
            print("❌ Failed to prepare audio session for TTS: \(error)")
            return
        }

        // Stop any ongoing speech first
        if speechSynthesizer.isSpeaking {
            speechSynthesizer.stopSpeaking(at: .immediate)
        }

        let utterance = AVSpeechUtterance(string: text)

        // Use selected voice or fallback to default
        if let voice = AVSpeechSynthesisVoice(identifier: selectedVoiceIdentifier) {
            utterance.voice = voice
        } else {
            // Fallback to default US English voice
            utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        }

        utterance.rate = 0.5
        utterance.pitchMultiplier = 1.0
        utterance.volume = 1.0

        speechSynthesizer.speak(utterance)

        print("🔊 Speaking response with voice \(selectedVoiceIdentifier): \(text.prefix(50))...")
    }

    func startWakeWordDetection() async {
        print("📢 VoiceAssistantViewModel: Starting wake word detection (user enabled)")
        // Set the user preference flag
        audioManager.wakeWordEnabled = true
        wakeWordEnabled = true
        do {
            try await audioManager.startWakeWordDetection()
            print("✅ VoiceAssistantViewModel: Wake word detection started")
        } catch {
            print("❌ Failed to start wake word detection: \(error)")
            // Reset flags on failure
            audioManager.wakeWordEnabled = false
            wakeWordEnabled = false
        }
    }

    func stopWakeWordDetection() {
        print("📢 VoiceAssistantViewModel: Stopping wake word detection (user disabled)")
        // Clear the user preference flag
        audioManager.wakeWordEnabled = false
        wakeWordEnabled = false
        audioManager.stopWakeWordDetection()
    }

    func startVAD() {
        do {
            try audioManager.startVAD()
        } catch {
            print("Failed to start VAD: \(error)")
        }
    }

    func stopVAD() {
        audioManager.stopVAD()
    }

    func connectWebRTC(serverURL: String = "wss://your-backend-server.com") async {
        do {
            try await webRTCClient.connect(to: serverURL)
            print("WebRTC connected successfully")
        } catch {
            print("WebRTC connection failed: \(error)")
        }
    }

    func disconnectWebRTC() {
        webRTCClient.disconnect()
    }

    func startAudioStreaming() {
        do {
            try webRTCClient.startAudioStream()
        } catch {
            print("Failed to start audio streaming: \(error)")
        }
    }

    func stopAudioStreaming() {
        webRTCClient.stopAudioStream()
    }

    func startListening() {
        print("🎙️ Starting listening session")
        print("   Current transcript before clear: '\(transcript)'")
        print("   Current flag state: \(currentTranscriptAdded)")

        // Stop TTS immediately if it's speaking (user wants to interrupt)
        if speechSynthesizer.isSpeaking {
            print("🔇 Stopping TTS playback - user interrupted")
            speechSynthesizer.stopSpeaking(at: .immediate)
        }

        // Clear previous transcript to start fresh
        transcript = ""
        currentTranscriptAdded = false // Reset flag for new recording

        print("   Transcript cleared, flag reset")

        switch recognitionMode {
        case .privacyMode, .standardMode:
            // Use native speech recognition
            // NOTE: Do NOT call audioManager.startRecording() as it conflicts with speech recognizer's audio engine
            do {
                try speechRecognitionManager.startRecognition()
                // Just update UI state without starting audio manager
                audioManager.isRecording = true
                print("✅ Speech recognition started successfully")
            } catch {
                print("❌ Failed to start speech recognition: \(error)")
                recognitionError = error.localizedDescription
            }

        case .professionalMode:
            // Use traditional WebRTC approach
            audioManager.startRecording()
            startAudioStreaming()
        }
    }

    func stopListening() {
        print("🛑 Stopping listening session")
        print("   Current transcript: '\(transcript)'")
        print("   Flag state: \(currentTranscriptAdded)")

        switch recognitionMode {
        case .privacyMode, .standardMode:
            // Stop native speech recognition
            speechRecognitionManager.stopRecognition()
            // Just update UI state
            audioManager.isRecording = false

            // Add message if we have a transcript and it hasn't been added yet
            // This handles the case where user manually stops before system marks as final
            if !transcript.isEmpty && !currentTranscriptAdded {
                print("📝 Adding transcript on manual stop: \(transcript)")
                addUserMessage(transcript)
                currentTranscriptAdded = true
                print("   Message added, messages count: \(messages.count)")

                // Send to backend for native speech modes
                Task {
                    await sendTranscriptToBackend(transcript)
                }
            } else if currentTranscriptAdded {
                print("ℹ️ Transcript already added via callback")
            } else if transcript.isEmpty {
                print("⚠️ No transcript to add (empty)")
            }

        case .professionalMode:
            // Stop WebRTC streaming
            audioManager.stopRecording()
            stopAudioStreaming()
        }

        // Restart wake word detection if the user has it enabled in settings
        // wakeWordEnabled represents the user's preference - if true, keep it running
        if wakeWordEnabled {
            print("🔄 VoiceAssistantViewModel: User has wake word enabled, restarting detection...")
            Task {
                // Longer delay to ensure all audio resources released and TTS can finish
                try? await Task.sleep(nanoseconds: 1_000_000_000) // 1.0 second

                // Check if TTS is speaking and wait for it to finish
                if self.speechSynthesizer.isSpeaking {
                    print("🔊 TTS is speaking, waiting to restart wake word...")
                    // Wait for TTS to finish
                    var attempts = 0
                    while self.speechSynthesizer.isSpeaking && attempts < 20 {  // Max 10 seconds wait
                        try? await Task.sleep(nanoseconds: 500_000_000)  // Check every 0.5 seconds
                        attempts += 1
                    }
                    if attempts >= 20 {
                        print("⚠️ TTS took too long, proceeding with wake word restart")
                    } else {
                        print("✅ TTS finished, now restarting wake word")
                    }
                }

                // Only restart if it's not already listening (avoid duplicate starts)
                if !audioManager.wakeWordDetector.isListening {
                    do {
                        try await audioManager.startWakeWordDetection()
                        print("✅ VoiceAssistantViewModel: Wake word detection restarted successfully")
                    } catch {
                        print("❌ VoiceAssistantViewModel: Failed to restart wake word detection: \(error)")
                    }
                } else {
                    print("ℹ️ VoiceAssistantViewModel: Wake word detection already running")
                }
            }
        } else {
            print("ℹ️ VoiceAssistantViewModel: Wake word not enabled by user, not restarting")
        }
    }

    // Request permissions for speech recognition
    func requestSpeechPermissions() async -> Bool {
        let authorized = await speechRecognitionManager.requestAuthorization()
        if !authorized {
            recognitionError = "Speech recognition permission denied"
        }
        return authorized
    }

    func authenticate() async throws {
        // Try biometric authentication if enabled
        if authService.biometricAuthEnabled {
            let biometricSuccess = try await authService.authenticateWithBiometrics()
            guard biometricSuccess else {
                throw AuthenticationError.biometricFailed
            }
        }

        // Register device if not already registered
        if authService.getDeviceToken() == nil {
            let (deviceToken, userId) = try await authService.registerDevice()
            try await grpcClient.authenticate(with: deviceToken, userId: userId)
        } else {
            // Use existing credentials
            let userId = authService.getUserId() ?? UUID().uuidString
            if let token = authService.getDeviceToken() {
                try await grpcClient.authenticate(with: token, userId: userId)
            }
        }
    }

    enum AuthenticationError: Error {
        case biometricFailed
    }

    // MARK: - Session Management

    func startSession(
        audioConfig: AudioConfig? = nil,
        voiceConfig: VoiceConfig? = nil
    ) async throws {
        let finalAudioConfig = audioConfig ?? .default
        let finalVoiceConfig = voiceConfig ?? .default
        let response = try await grpcClient.startSession(
            audioConfig: finalAudioConfig,
            voiceConfig: finalVoiceConfig,
            metadata: [
                "platform": "ios",
                "app_version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"
            ]
        )

        if let sessionId = response.sessionId as String?, !sessionId.isEmpty {
            print("✅ Session started: \(sessionId)")

            // Start WebRTC connection with offer from backend
            if response.webrtcOffer != nil {
                // TODO: Use the WebRTC offer to establish connection
                print("📡 Received WebRTC offer")
            }

            // Start audio streaming
            startAudioStreaming()
        } else if let errorMessage = response.errorMessage {
            throw GRPCClientError.serverError(errorMessage)
        }
    }

    func stopSession() async throws {
        // Stop audio streaming first
        stopAudioStreaming()

        // Stop the session via gRPC
        let _ = try await grpcClient.stopSession()
        sessionStatus = "inactive"
    }

    func updateSessionConfig(
        audioConfig: AudioConfig? = nil,
        voiceConfig: VoiceConfig? = nil
    ) async throws {
        let _ = try await grpcClient.updateSessionConfig(
            audioConfig: audioConfig,
            voiceConfig: voiceConfig
        )
    }

    func refreshSessionStatus() async throws {
        let response = try await grpcClient.getSessionStatus()
        sessionStatus = response.status
    }

    func listSessions() async throws -> [SessionInfo] {
        let response = try await grpcClient.listSessions()
        return response.sessions
    }

    // MARK: - Transcript Management

    func addUserMessage(_ text: String) {
        let message = TranscriptMessage(
            text: text,
            timestamp: Date(),
            role: .user,
            sources: nil
        )
        messages.append(message)
        transcript = text

        // Save to conversation manager
        conversationManager.addMessage(StoredMessage.from(message))
    }

    func addAssistantMessage(_ text: String, sources: [Citation]? = nil) {
        let message = TranscriptMessage(
            text: text,
            timestamp: Date(),
            role: .assistant,
            sources: sources
        )
        messages.append(message)
        isStreaming = false

        // Save to conversation manager
        conversationManager.addMessage(StoredMessage.from(message))
    }

    func addSystemMessage(_ text: String) {
        let message = TranscriptMessage(
            text: text,
            timestamp: Date(),
            role: .system,
            sources: nil
        )
        messages.append(message)

        // Save to conversation manager
        conversationManager.addMessage(StoredMessage.from(message))
    }

    func startStreaming() {
        isStreaming = true
    }

    func clearTranscript() {
        messages.removeAll()
        transcript = ""
        isStreaming = false
        conversationManager.clearCurrentConversation()
    }

    // MARK: - Conversation Management

    /// Load messages from the current conversation
    private func loadMessagesFromConversation() {
        guard let conversation = conversationManager.currentConversation else {
            print("⚠️ No current conversation to load messages from")
            return
        }
        messages = conversation.messages.map { $0.toTranscriptMessage() }
        print("✅ Loaded \(messages.count) messages from conversation")
    }

    /// Create a new conversation
    func createNewConversation() {
        conversationManager.createNewConversation()
        messages.removeAll()
        transcript = ""
        isStreaming = false
    }

    /// Load a previous conversation
    func loadConversation(_ conversation: Conversation) {
        conversationManager.loadConversation(conversation)
        loadMessagesFromConversation()
        transcript = ""
        isStreaming = false
    }

    /// Get the last 25 messages to send to LLM
    func getMessagesForLLM() -> [StoredMessage] {
        // TEMPORARY FIX: Use local messages array instead of ConversationManager
        // Convert local messages to StoredMessage format for sending to backend
        let storedMessages = messages.prefix(25).map { msg in
            StoredMessage.from(msg)
        }
        print("🎯 getMessagesForLLM returning \(storedMessages.count) messages from local array")
        return storedMessages
    }

    // MARK: - Audio Visualization

    func updateAudioAmplitudes(_ amplitudes: [Float]) {
        self.audioAmplitudes = amplitudes
    }

    func simulateAudioAmplitudes() {
        // For testing - generate random amplitudes
        audioAmplitudes = (0..<50).map { _ in Float.random(in: 0.1...0.9) }
    }

    // MARK: - Text-to-Speech

    /// Get all available English voices grouped by language/region
    static func getAvailableVoices() -> [VoiceGroup] {
        let allVoices = AVSpeechSynthesisVoice.speechVoices()

        // Filter for English voices only
        let allEnglishVoices = allVoices.filter { voice in
            voice.language.starts(with: "en")
        }

        // Prefer Enhanced/Premium quality, but include Standard if no high-quality voices available
        var englishVoices = allEnglishVoices.filter { voice in
            voice.quality == .enhanced || voice.quality == .premium
        }

        // If no Enhanced/Premium voices, fall back to all English voices
        if englishVoices.isEmpty {
            englishVoices = allEnglishVoices
        }

        // Group by language
        var groupedVoices: [String: [AVSpeechSynthesisVoice]] = [:]
        for voice in englishVoices {
            let language = voice.language
            if groupedVoices[language] == nil {
                groupedVoices[language] = []
            }
            groupedVoices[language]?.append(voice)
        }

        // Convert to VoiceGroup array
        return groupedVoices.map { (language, voices) in
            VoiceGroup(
                language: language,
                languageName: languageDisplayName(for: language),
                voices: voices.sorted { $0.name < $1.name }
            )
        }.sorted { $0.languageName < $1.languageName }
    }

    private static func languageDisplayName(for code: String) -> String {
        switch code {
        case "en-US": return "English (US)"
        case "en-GB": return "English (UK)"
        case "en-AU": return "English (Australia)"
        case "en-IE": return "English (Ireland)"
        case "en-ZA": return "English (South Africa)"
        case "en-IN": return "English (India)"
        default: return code
        }
    }
}

// MARK: - Voice Models

struct VoiceGroup: Identifiable {
    let id = UUID()
    let language: String
    let languageName: String
    let voices: [AVSpeechSynthesisVoice]
}
