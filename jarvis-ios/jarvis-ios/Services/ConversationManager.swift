//
//  ConversationManager.swift
//  jarvis-ios
//
//  Manages conversation persistence using file-based storage
//

import Foundation
import Combine

@MainActor
class ConversationManager: ObservableObject {
    static let shared = ConversationManager()

    @Published var conversations: [Conversation] = []
    @Published var currentConversation: Conversation?

    private let fileManager = FileManager.default
    private let conversationsDirectory: URL

    private init() {
        // Create conversations directory in Documents
        let documentsPath = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        conversationsDirectory = documentsPath.appendingPathComponent("Conversations", isDirectory: true)

        // Create directory if it doesn't exist
        try? fileManager.createDirectory(at: conversationsDirectory, withIntermediateDirectories: true)

        // Load existing conversations
        loadConversations()

        // Create a new conversation if none exist
        if conversations.isEmpty {
            print("🆕 No existing conversations found, creating new one")
            createNewConversation()
        } else {
            // Load the most recent conversation as current
            currentConversation = conversations.first
            print("📂 Loaded existing conversation with \(currentConversation?.messages.count ?? 0) messages")
        }
    }

    // MARK: - Conversation Management

    /// Create a new conversation
    func createNewConversation() {
        let newConversation = Conversation()
        conversations.insert(newConversation, at: 0)
        currentConversation = newConversation
        saveConversation(newConversation)
    }

    /// Load a conversation and make it current
    func loadConversation(_ conversation: Conversation) {
        currentConversation = conversation
    }

    /// Add a message to the current conversation
    func addMessage(_ message: StoredMessage) {
        guard var conversation = currentConversation else {
            // Create new conversation if none exists
            createNewConversation()
            if var newConversation = currentConversation {
                newConversation.messages.append(message)
                newConversation.updatedAt = Date()
                updateConversation(newConversation)
                print("📝 Added message to NEW conversation. Total messages: \(newConversation.messages.count)")
            }
            return
        }

        var updatedConversation = conversation
        updatedConversation.messages.append(message)
        updatedConversation.updatedAt = Date()
        updateConversation(updatedConversation)
        print("📝 Added message to existing conversation. Total messages: \(updatedConversation.messages.count)")
    }

    /// Update an existing conversation
    func updateConversation(_ conversation: Conversation) {
        if let index = conversations.firstIndex(where: { $0.id == conversation.id }) {
            conversations[index] = conversation
            if currentConversation?.id == conversation.id {
                currentConversation = conversation
            }
            saveConversation(conversation)
        }
    }

    /// Delete a conversation
    func deleteConversation(_ conversation: Conversation) {
        // Remove from array
        conversations.removeAll { $0.id == conversation.id }

        // Delete file
        let fileURL = conversationFileURL(for: conversation.id)
        try? fileManager.removeItem(at: fileURL)

        // If we deleted the current conversation, switch to another or create new
        if currentConversation?.id == conversation.id {
            if let firstConversation = conversations.first {
                currentConversation = firstConversation
            } else {
                createNewConversation()
            }
        }
    }

    /// Clear all messages in the current conversation
    func clearCurrentConversation() {
        guard var conversation = currentConversation else { return }
        conversation.messages.removeAll()
        conversation.updatedAt = Date()
        updateConversation(conversation)
    }

    /// Get messages for LLM (last 25 messages)
    func getMessagesForLLM() -> [StoredMessage] {
        let messages = currentConversation?.getRecentMessages(limit: 25) ?? []
        print("🔍 getMessagesForLLM returning \(messages.count) messages")
        for (index, msg) in messages.enumerated() {
            print("  Message \(index): [\(msg.role)] \(String(msg.text.prefix(50)))...")
        }
        return messages
    }

    // MARK: - File Operations

    private func conversationFileURL(for id: UUID) -> URL {
        return conversationsDirectory.appendingPathComponent("\(id.uuidString).json")
    }

    /// Save a conversation to disk
    private func saveConversation(_ conversation: Conversation) {
        let fileURL = conversationFileURL(for: conversation.id)
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(conversation)
            try data.write(to: fileURL)
        } catch {
            print("Error saving conversation: \(error)")
        }
    }

    /// Load all conversations from disk
    private func loadConversations() {
        do {
            let fileURLs = try fileManager.contentsOfDirectory(
                at: conversationsDirectory,
                includingPropertiesForKeys: [.contentModificationDateKey],
                options: [.skipsHiddenFiles]
            )

            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601

            var loadedConversations: [Conversation] = []

            for fileURL in fileURLs where fileURL.pathExtension == "json" {
                do {
                    let data = try Data(contentsOf: fileURL)
                    let conversation = try decoder.decode(Conversation.self, from: data)
                    loadedConversations.append(conversation)
                } catch {
                    print("Error loading conversation from \(fileURL): \(error)")
                }
            }

            // Sort by most recent first
            conversations = loadedConversations.sorted { $0.updatedAt > $1.updatedAt }

        } catch {
            print("Error loading conversations: \(error)")
        }
    }

    /// Get all conversations sorted by date
    func getAllConversations() -> [Conversation] {
        return conversations.sorted { $0.updatedAt > $1.updatedAt }
    }
}
