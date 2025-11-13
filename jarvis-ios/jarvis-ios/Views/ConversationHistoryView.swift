//
//  ConversationHistoryView.swift
//  jarvis-ios
//
//  View for displaying and managing conversation history
//

import SwiftUI

struct ConversationHistoryView: View {
    @ObservedObject var conversationManager: ConversationManager
    @ObservedObject var viewModel: VoiceAssistantViewModel
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationView {
            List {
                ForEach(conversationManager.getAllConversations()) { conversation in
                    ConversationRowView(conversation: conversation)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            viewModel.loadConversation(conversation)
                            dismiss()
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                conversationManager.deleteConversation(conversation)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                }
            }
            .navigationTitle("Conversations")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Done") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        viewModel.createNewConversation()
                        dismiss()
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
        }
    }
}

struct ConversationRowView: View {
    let conversation: Conversation

    private var formattedDate: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: conversation.updatedAt, relativeTo: Date())
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(conversation.displayTitle)
                .font(.headline)
                .lineLimit(2)

            HStack {
                Label("\(conversation.messageCount) messages", systemImage: "message")
                    .font(.caption)
                    .foregroundColor(.secondary)

                Spacer()

                Text(formattedDate)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Preview

struct ConversationHistoryView_Previews: PreviewProvider {
    static var previews: some View {
        // Create sample data for preview
        let sampleMessages = [
            StoredMessage(text: "Hello, how are you?", role: .user),
            StoredMessage(text: "I'm doing well, thank you! How can I help you today?", role: .assistant),
            StoredMessage(text: "Can you tell me about SwiftUI?", role: .user),
            StoredMessage(text: "SwiftUI is Apple's modern framework for building user interfaces.", role: .assistant)
        ]

        let conversation1 = Conversation(
            title: "SwiftUI Discussion",
            messages: sampleMessages,
            createdAt: Date().addingTimeInterval(-86400),
            updatedAt: Date().addingTimeInterval(-3600)
        )

        let conversation2 = Conversation(
            title: "New Conversation",
            messages: Array(sampleMessages.prefix(2)),
            createdAt: Date().addingTimeInterval(-172800),
            updatedAt: Date().addingTimeInterval(-172800)
        )

        let manager = ConversationManager.shared
        manager.conversations = [conversation1, conversation2]

        // Create a mock ViewModel
        let audioManager = AudioManager()
        let webRTCClient = WebRTCClient()
        let grpcClient = GRPCClient()
        let authService = AuthenticationService()
        let speechRecognitionManager = SpeechRecognitionManager()
        let viewModel = VoiceAssistantViewModel(
            audioManager: audioManager,
            webRTCClient: webRTCClient,
            grpcClient: grpcClient,
            authService: authService,
            speechRecognitionManager: speechRecognitionManager,
            conversationManager: manager
        )

        return ConversationHistoryView(
            conversationManager: manager,
            viewModel: viewModel
        )
    }
}
