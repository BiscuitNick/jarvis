# gRPC Client Implementation

## Overview

The iOS client includes a gRPC client for session control and device authentication. The implementation uses Swift models that mirror the proto definitions and communicates with the backend using JSON over HTTP.

## Current Implementation

### Files

- **Models/SessionModels.swift**: Swift models matching the proto definitions
- **Services/Network/GRPCClient.swift**: gRPC client implementation with retry logic
- **ViewModels/VoiceAssistantViewModel.swift**: Integration of gRPC client with app logic

### Features

✅ Session management (start, stop, status, update)
✅ Device authentication with token storage
✅ Automatic retry logic with exponential backoff
✅ Connection state management
✅ Error handling and recovery
✅ JSON encoding/decoding with snake_case conversion

## Usage

### Authentication

```swift
let viewModel = VoiceAssistantViewModel(...)
try await viewModel.authenticate()
```

### Starting a Session

```swift
let audioConfig = AudioConfig(
    sampleRate: 16000,
    channels: 1,
    bitDepth: 16,
    codec: "opus"
)

let voiceConfig = VoiceConfig(
    voiceId: "default",
    speed: 1.0,
    pitch: 1.0,
    language: "en-US"
)

try await viewModel.startSession(
    audioConfig: audioConfig,
    voiceConfig: voiceConfig
)
```

### Stopping a Session

```swift
try await viewModel.stopSession()
```

### Checking Session Status

```swift
try await viewModel.refreshSessionStatus()
print(viewModel.sessionStatus)
```

## Backend Integration

The gRPC client expects the backend to expose the following endpoints:

```
POST /jarvis.ingress.SessionControl/StartSession
POST /jarvis.ingress.SessionControl/StopSession
POST /jarvis.ingress.SessionControl/GetSessionStatus
POST /jarvis.ingress.SessionControl/UpdateSessionConfig
POST /jarvis.ingress.SessionControl/ListSessions
```

### Request/Response Format

Requests and responses use JSON with snake_case field names:

```json
// StartSession Request
{
  "user_id": "uuid",
  "audio_config": {
    "sample_rate": 16000,
    "channels": 1,
    "bit_depth": 16,
    "codec": "opus"
  },
  "voice_config": {
    "voice_id": "default",
    "speed": 1.0,
    "pitch": 1.0,
    "language": "en-US"
  },
  "metadata": {
    "platform": "ios",
    "app_version": "1.0"
  }
}

// StartSession Response
{
  "session_id": "session-uuid",
  "status": "active",
  "webrtc_offer": "sdp-offer-string",
  "error_message": null
}
```

### Authentication

The client sends a Bearer token in the Authorization header:

```
Authorization: Bearer <device-token>
```

## Configuration

The gRPC client can be configured with a custom base URL:

```swift
let grpcClient = GRPCClient(baseURL: "https://your-backend.com")
```

Default: `http://localhost:50051`

## Future Enhancements

### Using grpc-swift Package

For production, consider using the official `grpc-swift` package:

1. **Install protoc and grpc-swift plugin**:
   ```bash
   brew install protobuf swift-protobuf
   brew install grpc-swift
   ```

2. **Add grpc-swift to Package.swift**:
   ```swift
   dependencies: [
       .package(url: "https://github.com/grpc/grpc-swift.git", from: "1.15.0")
   ]
   ```

3. **Generate Swift code from proto**:
   ```bash
   protoc services/ingress-service/proto/session.proto \
     --swift_out=jarvis-ios/jarvis-ios/Generated \
     --grpc-swift_out=jarvis-ios/jarvis-ios/Generated \
     --plugin=protoc-gen-grpc-swift
   ```

4. **Update GRPCClient to use generated code**:
   ```swift
   import GRPC
   import NIO

   class GRPCClient {
       private var client: Jarvis_Ingress_SessionControlAsyncClient

       init(baseURL: String) {
           let group = PlatformSupport.makeEventLoopGroup(loopCount: 1)
           let channel = try! GRPCChannelPool.with(
               target: .host(baseURL),
               transportSecurity: .plaintext,
               eventLoopGroup: group
           )
           self.client = Jarvis_Ingress_SessionControlAsyncClient(channel: channel)
       }
   }
   ```

## Error Handling

The client handles various error scenarios:

- **Network errors**: Automatic retry with backoff
- **Server errors (5xx)**: Automatic retry up to 3 times
- **Client errors (4xx)**: Immediate failure with error message
- **Authentication errors**: Thrown as `GRPCClientError.notAuthenticated`
- **Invalid responses**: Thrown as `GRPCClientError.invalidResponse`

## Testing

To test the gRPC client:

1. Start the backend ingress service
2. Configure the client with the correct base URL
3. Run the iOS app in simulator or device
4. Check console logs for connection status and errors

Example test flow:
```swift
// In ContentView or test file
Task {
    try await viewModel.authenticate()
    print("✅ Authenticated")

    try await viewModel.startSession()
    print("✅ Session started: \(viewModel.currentSessionId ?? "none")")

    try await Task.sleep(for: .seconds(5))

    try await viewModel.stopSession()
    print("✅ Session stopped")
}
```

## Monitoring

The client provides observable properties for monitoring:

- `grpcConnected`: Connection state
- `currentSessionId`: Active session ID
- `sessionStatus`: Current session status (active/inactive/expired)

Bind these in SwiftUI views:
```swift
Text("Status: \(viewModel.sessionStatus)")
    .foregroundColor(viewModel.grpcConnected ? .green : .red)
```
