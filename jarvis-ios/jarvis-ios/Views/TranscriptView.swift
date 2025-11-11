//
//  TranscriptView.swift
//  jarvis-ios
//
//  Scrolling transcript view with real-time updates
//

import SwiftUI

struct TranscriptMessage: Identifiable {
    let id = UUID()
    let text: String
    let timestamp: Date
    let role: MessageRole
    let sources: [Citation]?

    enum MessageRole {
        case user
        case assistant
        case system
    }
}

struct Citation: Identifiable {
    let id = UUID()
    let title: String
    let url: String?
    let snippet: String?
}

struct TranscriptView: View {
    let messages: [TranscriptMessage]
    let isStreaming: Bool

    @State private var scrollProxy: ScrollViewProxy?

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    if messages.isEmpty {
                        EmptyTranscriptView()
                    } else {
                        ForEach(messages) { message in
                            TranscriptMessageView(message: message)
                                .id(message.id)
                        }

                        if isStreaming {
                            StreamingIndicatorView()
                                .id("streaming")
                        }
                    }
                }
                .padding()
            }
            .onAppear {
                scrollProxy = proxy
            }
            .onChange(of: messages.count) { _, _ in
                scrollToBottom()
            }
            .onChange(of: isStreaming) { _, _ in
                scrollToBottom()
            }
        }
    }

    private func scrollToBottom() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            withAnimation(.easeOut(duration: 0.3)) {
                if isStreaming {
                    scrollProxy?.scrollTo("streaming", anchor: .bottom)
                } else if let lastMessage = messages.last {
                    scrollProxy?.scrollTo(lastMessage.id, anchor: .bottom)
                }
            }
        }
    }
}

// MARK: - Message View

struct TranscriptMessageView: View {
    let message: TranscriptMessage
    @State private var showSources = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                // Role indicator
                Image(systemName: roleIcon)
                    .foregroundColor(roleColor)
                    .font(.system(size: 14))
                    .frame(width: 20)

                VStack(alignment: .leading, spacing: 4) {
                    // Message text
                    Text(message.text)
                        .font(.body)
                        .foregroundColor(.primary)
                        .textSelection(.enabled)

                    // Timestamp
                    Text(timeString)
                        .font(.caption2)
                        .foregroundColor(.secondary)

                    // Sources button
                    if let sources = message.sources, !sources.isEmpty {
                        Button(action: {
                            showSources.toggle()
                        }) {
                            HStack(spacing: 4) {
                                Image(systemName: "doc.text.magnifyingglass")
                                Text("\(sources.count) source\(sources.count > 1 ? "s" : "")")
                            }
                            .font(.caption)
                            .foregroundColor(.blue)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.blue.opacity(0.1))
                            .cornerRadius(8)
                        }
                    }
                }

                Spacer()
            }
            .padding(12)
            .background(messageBackground)
            .cornerRadius(12)

            // Expanded sources view
            if showSources, let sources = message.sources {
                SourcesView(sources: sources)
                    .transition(.opacity.combined(with: .scale))
            }
        }
    }

    private var roleIcon: String {
        switch message.role {
        case .user: return "person.fill"
        case .assistant: return "brain.head.profile"
        case .system: return "info.circle.fill"
        }
    }

    private var roleColor: Color {
        switch message.role {
        case .user: return .blue
        case .assistant: return .green
        case .system: return .gray
        }
    }

    private var messageBackground: Color {
        switch message.role {
        case .user: return Color.blue.opacity(0.08)
        case .assistant: return Color.green.opacity(0.08)
        case .system: return Color.gray.opacity(0.05)
        }
    }

    private var timeString: String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: message.timestamp)
    }
}

// MARK: - Sources View

struct SourcesView: View {
    let sources: [Citation]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Sources")
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.secondary)

            ForEach(sources) { source in
                CitationView(citation: source)
            }
        }
        .padding(12)
        .background(Color.gray.opacity(0.05))
        .cornerRadius(8)
    }
}

struct CitationView: View {
    let citation: Citation
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button(action: {
                if let urlString = citation.url, let url = URL(string: urlString) {
                    openURL(url)
                }
            }) {
                HStack {
                    Text(citation.title)
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundColor(.primary)

                    if citation.url != nil {
                        Image(systemName: "arrow.up.right.square")
                            .font(.caption2)
                            .foregroundColor(.blue)
                    }
                }
            }

            if let snippet = citation.snippet {
                Text(snippet)
                    .font(.caption2)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.5))
        .cornerRadius(6)
    }
}

// MARK: - Empty State

struct EmptyTranscriptView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "text.bubble")
                .font(.system(size: 48))
                .foregroundColor(.gray.opacity(0.5))

            VStack(spacing: 4) {
                Text("No conversation yet")
                    .font(.headline)
                    .foregroundColor(.primary)

                Text("Say 'Jarvis' to start")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}

// MARK: - Streaming Indicator

struct StreamingIndicatorView: View {
    @State private var dotCount = 0

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "brain.head.profile")
                .foregroundColor(.green)
                .font(.system(size: 14))

            Text("Thinking")
                .font(.caption)
                .foregroundColor(.secondary)

            HStack(spacing: 2) {
                ForEach(0..<3) { index in
                    Circle()
                        .fill(Color.green.opacity(index <= dotCount ? 1.0 : 0.3))
                        .frame(width: 4, height: 4)
                }
            }
        }
        .padding(12)
        .background(Color.green.opacity(0.08))
        .cornerRadius(12)
        .onAppear {
            startAnimation()
        }
    }

    private func startAnimation() {
        Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { _ in
            withAnimation {
                dotCount = (dotCount + 1) % 4
            }
        }
    }
}

#Preview("Transcript with Messages") {
    TranscriptView(
        messages: [
            TranscriptMessage(
                text: "What's the weather today?",
                timestamp: Date(),
                role: .user,
                sources: nil
            ),
            TranscriptMessage(
                text: "The weather today is sunny with a high of 75°F. It's a great day to go outside!",
                timestamp: Date(),
                role: .assistant,
                sources: [
                    Citation(title: "Weather.com", url: "https://weather.com", snippet: "Current conditions: Sunny, 75°F"),
                    Citation(title: "NOAA", url: "https://noaa.gov", snippet: "Forecast: Clear skies expected")
                ]
            ),
            TranscriptMessage(
                text: "Wake word detection enabled",
                timestamp: Date(),
                role: .system,
                sources: nil
            )
        ],
        isStreaming: false
    )
    .frame(height: 400)
}

#Preview("Empty Transcript") {
    TranscriptView(messages: [], isStreaming: false)
        .frame(height: 400)
}

#Preview("Streaming") {
    TranscriptView(
        messages: [
            TranscriptMessage(
                text: "Tell me about AI",
                timestamp: Date(),
                role: .user,
                sources: nil
            )
        ],
        isStreaming: true
    )
    .frame(height: 400)
}
