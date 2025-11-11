# iOS Native Speech Recognition Analysis

## Executive Summary

iOS's Speech framework provides native speech-to-text capabilities that could replace sending raw audio to 3rd-party services. This document analyzes the feasibility, benefits, and limitations of using native iOS speech recognition for the Jarvis voice assistant.

## Current Architecture vs Native Speech

### Current Approach (WebRTC + 3rd Party STT)
```
iOS Mic → AudioEngine → WebRTC Stream → Backend → 3rd Party STT → LLM → TTS → WebRTC → iOS Speaker
```

### Proposed Approach (Native iOS Speech)
```
iOS Mic → AudioEngine → Speech Framework → Text → gRPC → Backend → LLM → TTS → iOS Speaker
```

**Key Difference**: Speech-to-text happens **on-device** or via **Apple's cloud**, eliminating need to stream raw audio to 3rd party.

## Detailed Comparison

| Feature | Current (WebRTC + 3rd Party) | Native iOS Speech |
|---------|------------------------------|-------------------|
| **Privacy** | Audio sent to 3rd party servers | On-device or Apple cloud only |
| **Offline Capability** | ❌ Requires internet | ✅ On-device works offline |
| **Latency** | 200-500ms (network + processing) | 100-150ms (on-device) |
| **Accuracy** | Varies by provider (high) | Good (cloud), moderate (on-device) |
| **Cost** | $ per minute/API call | Free (built into iOS) |
| **Language Support** | Varies by provider | 60+ languages |
| **Setup Complexity** | High (WebRTC + backend) | Low (native iOS API) |
| **Session Duration** | Unlimited | **1 minute limit (on-device)**, unlimited (cloud) |
| **Bandwidth** | High (raw audio streaming) | Low (text only) |
| **Battery Impact** | Moderate-High | Low-Moderate |

## Critical Limitations

### ⚠️ On-Device Recognition (requiresOnDeviceRecognition = true)
1. **1-MINUTE TIME LIMIT** - This is the most significant constraint
   - After 60 seconds, recognition stops
   - Must restart recognition task
   - May cause brief interruptions in transcription

2. **Accuracy Trade-off**
   - Less accurate than cloud-based
   - Struggles with accents, background noise
   - Limited vocabulary compared to cloud

3. **Resource Usage**
   - Uses device Neural Engine
   - May impact performance on older devices (< iPhone 12)

### ⚠️ Cloud-Based Recognition (requiresOnDeviceRecognition = false)
1. **Privacy Concerns**
   - Audio/text sent to Apple servers
   - Subject to Apple's privacy policy
   - Not suitable for sensitive conversations

2. **Rate Limiting**
   - Apple imposes unknown rate limits
   - May throttle heavy usage
   - No official documentation on limits

3. **Internet Dependency**
   - Requires stable connection
   - Network issues = recognition failure

## Architecture Recommendations

### Hybrid Approach (Recommended)

Use **both** native Speech framework AND traditional approach based on user preference and context:

#### Scenario 1: Privacy Mode (Native Speech)
```swift
// User enables "Privacy Mode" in settings
speechManager.setRecognitionMode(onDevice: true)

// Pros: Maximum privacy, works offline
// Cons: 1-minute limit, lower accuracy
// Use case: Sensitive conversations, offline use
```

#### Scenario 2: Standard Mode (Cloud Speech)
```swift
// Default mode for best experience
speechManager.setRecognitionMode(onDevice: false)

// Pros: Better accuracy, no time limits
// Cons: Requires internet, data sent to Apple
// Use case: General usage, best accuracy needed
```

#### Scenario 3: High-Fidelity Mode (WebRTC + 3rd Party)
```swift
// User enables "High Fidelity" mode
webRTCClient.startAudioStream()

// Pros: Best accuracy, custom STT models
// Cons: Highest cost, most complex
// Use case: Professional use, critical accuracy
```

## Implementation Plan

### Phase 1: Add Native Speech Recognition ✅
- [x] Create `SpeechRecognitionManager.swift`
- [ ] Integrate with existing `AudioManager`
- [ ] Handle 1-minute timeout gracefully
- [ ] Add UI toggle for recognition mode

### Phase 2: Testing & Optimization
- [ ] Test on-device accuracy across accents
- [ ] Measure battery impact
- [ ] Test automatic restart logic for 1-minute timeout
- [ ] Compare latency vs WebRTC approach

### Phase 3: User Settings
- [ ] Add "Recognition Mode" in Settings
  - Privacy Mode (on-device)
  - Standard Mode (Apple cloud)
  - High Fidelity Mode (3rd party)
- [ ] Add privacy explanations for each mode
- [ ] Allow per-session override

### Phase 4: Fallback Strategy
- [ ] Automatic fallback if Speech framework fails
- [ ] Switch to cloud if on-device accuracy is poor
- [ ] Network-aware mode selection

## Code Integration Example

```swift
// In SessionManager.swift
@MainActor
class SessionManager: ObservableObject {
    private let speechManager: SpeechRecognitionManager
    private let webRTCClient: WebRTCClient
    private let gRPCClient: GRPCSessionManager

    enum RecognitionMode {
        case onDevice      // Native on-device
        case cloud         // Native Apple cloud
        case webRTC        // Traditional WebRTC + 3rd party
    }

    @Published var recognitionMode: RecognitionMode = .cloud

    func startConversation() async throws {
        switch recognitionMode {
        case .onDevice, .cloud:
            // Use native Speech framework
            let onDevice = (recognitionMode == .onDevice)
            speechManager.setRecognitionMode(onDevice: onDevice)

            speechManager.onTranscript = { [weak self] transcript, isFinal in
                if isFinal {
                    // Send text to backend via gRPC
                    Task {
                        await self?.gRPCClient.sendUserMessage(transcript)
                    }
                }
            }

            try speechManager.startRecognition()

        case .webRTC:
            // Traditional approach: stream raw audio
            try await webRTCClient.connect(to: serverURL)
            try webRTCClient.startAudioStream()
        }
    }
}
```

## Performance Considerations

### Battery Life
- **On-device**: Uses Neural Engine, more efficient than streaming
- **Cloud**: Minimal processing, but network usage
- **WebRTC**: Continuous streaming, highest battery drain

### Network Usage
- **On-device**: Zero (except sending text results)
- **Cloud**: Moderate (compressed audio to Apple)
- **WebRTC**: High (continuous raw audio stream)

### Latency Breakdown

**Native Speech (On-Device)**
- Audio capture: ~5ms
- On-device processing: 100-150ms
- Text to backend: ~50ms
- **Total: ~155-205ms**

**Native Speech (Cloud)**
- Audio capture: ~5ms
- Upload to Apple: ~100ms
- Cloud processing: 200-300ms
- Text to backend: ~50ms
- **Total: ~355-455ms**

**WebRTC + 3rd Party**
- Audio capture: ~5ms
- WebRTC stream: ~50ms
- Backend buffering: ~50ms
- 3rd party STT: 200-400ms
- **Total: ~305-505ms**

## Recommendations

### ✅ Use Native Speech For:
1. **Quick queries** - Short questions/commands
2. **Privacy-conscious users** - On-device processing
3. **Offline scenarios** - No internet available
4. **Battery-sensitive situations** - Low power mode
5. **Cost optimization** - No STT API fees

### ❌ Don't Use Native Speech For:
1. **Long conversations** - 1-minute on-device limit is problematic
2. **High-accuracy requirements** - Medical, legal, financial
3. **Multi-speaker scenarios** - No speaker diarization
4. **Custom vocabulary** - Cannot train custom models
5. **Real-time streaming to LLM** - Text-only, can't stream partial audio

## Workarounds for 1-Minute Limitation

### Option 1: Automatic Restart (Implemented in SpeechRecognitionManager)
```swift
private func handleOnDeviceTimeout() {
    // Restart recognition automatically
    stopRecognition()
    Task {
        try? await Task.sleep(nanoseconds: 100_000_000)
        try? startRecognition()
    }
}
```
**Pros**: Seamless for user
**Cons**: Brief gap in recognition (~100ms)

### Option 2: Hybrid Timeout Switch
```swift
// After 50 seconds of on-device, switch to cloud
if onDeviceTimer > 50 {
    setRecognitionMode(onDevice: false)
}
```
**Pros**: No interruption
**Cons**: Privacy switch mid-conversation

### Option 3: Session Chunking
```swift
// Treat each 1-minute as a separate "turn"
// Send completed chunk to backend before timeout
if recognitionDuration > 50 {
    sendChunkToBackend(currentTranscript)
    restartRecognition()
}
```
**Pros**: Natural conversation flow
**Cons**: May split sentences awkwardly

## Security & Privacy

### On-Device Recognition
- ✅ Audio never leaves device
- ✅ Transcription happens locally
- ✅ HIPAA-friendly (no PHI transmission)
- ✅ Works in airplane mode
- ❌ Still sends text to your backend

### Cloud Recognition
- ⚠️ Audio/text sent to Apple servers
- ⚠️ Subject to Apple's privacy policy
- ⚠️ May not be GDPR/HIPAA compliant for sensitive data
- ⚠️ Apple may use data to improve models

### User Control
```swift
// Add privacy disclaimer in UI
Text("Privacy Mode: Audio processed on-device only")
Text("Standard Mode: Audio processed by Apple (better accuracy)")
Text("Learn more about privacy")
    .onTapGesture { showPrivacyPolicy() }
```

## Conclusion

### Should You Use Native iOS Speech?

**YES, if:**
- Privacy is a top concern
- You want to minimize costs
- Sessions are typically < 1 minute
- Offline capability is important
- Target audience is iOS-only

**NO, if:**
- You need best-in-class accuracy
- Long-form conversations are common
- You need speaker diarization
- Custom vocabulary/models required
- Multi-platform support needed

### Recommended Strategy

**Implement all three modes** and let users choose based on their needs:

1. **Privacy Mode** (on-device) - Default for new users
2. **Standard Mode** (Apple cloud) - Best balance
3. **Professional Mode** (WebRTC + 3rd party) - Optional upgrade

This gives users control over privacy/accuracy trade-offs while maximizing the value of iOS's built-in capabilities.

## Next Steps

1. ✅ Integrate `SpeechRecognitionManager` into `SessionManager`
2. Add UI controls for mode selection in Settings
3. Implement automatic timeout handling
4. Add analytics to compare mode performance
5. Create user education materials about each mode
6. A/B test default mode with beta users

---

**Author**: Jarvis iOS Team
**Date**: 2025-01-11
**Status**: Proposal - Ready for Implementation
