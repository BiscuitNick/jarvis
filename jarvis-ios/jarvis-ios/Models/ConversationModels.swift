//
//  ConversationModels.swift
//  jarvis-ios
//
//  Data models for conversation history management
//

import Foundation

// MARK: - Conversation

struct Conversation: Identifiable, Codable {
    let id: UUID
    var title: String
    var messages: [StoredMessage]
    var createdAt: Date
    var updatedAt: Date

    init(id: UUID = UUID(), title: String = "New Conversation", messages: [StoredMessage] = [], createdAt: Date = Date(), updatedAt: Date = Date()) {
        self.id = id
        self.title = title
        self.messages = messages
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    /// Get the display title - uses first user message or default title
    var displayTitle: String {
        if let firstUserMessage = messages.first(where: { $0.role == .user }) {
            let maxLength = 50
            let text = firstUserMessage.text.trimmingCharacters(in: .whitespacesAndNewlines)
            return text.count > maxLength ? String(text.prefix(maxLength)) + "..." : text
        }
        return title
    }

    /// Get message count
    var messageCount: Int {
        return messages.count
    }

    /// Get last 25 messages for sending to LLM
    func getRecentMessages(limit: Int = 25) -> [StoredMessage] {
        return Array(messages.suffix(limit))
    }
}

// MARK: - Stored Message

struct StoredMessage: Identifiable, Codable {
    let id: UUID
    let text: String
    let timestamp: Date
    let role: MessageRole
    let sources: [StoredCitation]?

    init(id: UUID = UUID(), text: String, timestamp: Date = Date(), role: MessageRole, sources: [StoredCitation]? = nil) {
        self.id = id
        self.text = text
        self.timestamp = timestamp
        self.role = role
        self.sources = sources
    }

    enum MessageRole: String, Codable {
        case user
        case assistant
        case system
    }
}

// MARK: - Stored Citation

struct StoredCitation: Identifiable, Codable {
    let id: UUID
    let title: String
    let url: String?
    let snippet: String?

    init(id: UUID = UUID(), title: String, url: String? = nil, snippet: String? = nil) {
        self.id = id
        self.title = title
        self.url = url
        self.snippet = snippet
    }
}

// MARK: - Conversion Extensions

extension StoredMessage {
    /// Convert to TranscriptMessage for UI display
    func toTranscriptMessage() -> TranscriptMessage {
        let transcriptRole: TranscriptMessage.MessageRole = {
            switch role {
            case .user: return .user
            case .assistant: return .assistant
            case .system: return .system
            }
        }()

        let citations = sources?.map { Citation(id: $0.id, title: $0.title, url: $0.url, snippet: $0.snippet) }

        return TranscriptMessage(id: id, text: text, timestamp: timestamp, role: transcriptRole, sources: citations)
    }

    /// Create from TranscriptMessage
    static func from(_ message: TranscriptMessage) -> StoredMessage {
        let storedRole: MessageRole = {
            switch message.role {
            case .user: return .user
            case .assistant: return .assistant
            case .system: return .system
            }
        }()

        let storedSources = message.sources?.map { StoredCitation(id: $0.id, title: $0.title, url: $0.url, snippet: $0.snippet) }

        return StoredMessage(id: message.id, text: message.text, timestamp: message.timestamp, role: storedRole, sources: storedSources)
    }
}
