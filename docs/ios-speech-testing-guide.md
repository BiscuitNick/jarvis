# iOS Native Speech Recognition Testing Guide

## What Was Implemented

We've successfully integrated iOS's native Speech framework into Jarvis, giving users three recognition modes:

1. **Privacy Mode** - On-device recognition (private, works offline)
2. **Standard Mode** - Apple cloud recognition (better accuracy)
3. **Professional Mode** - WebRTC + 3rd party STT (best accuracy, future implementation)

## Files Modified/Created

### New Files
- ✅ `Services/Audio/SpeechRecognitionManager.swift` - Core speech recognition logic
- ✅ `Views/SettingsView.swift` - Enhanced settings UI with mode picker
- ✅ `docs/ios-native-speech-analysis.md` - Comprehensive analysis document

### Modified Files
- ✅ `ViewModels/VoiceAssistantViewModel.swift` - Added speech recognition integration
- ✅ `ContentView.swift` - Added recognition mode indicator and permissions

## How to Test in Xcode

### Step 1: Build and Run

```bash
open /Users/nickkenkel/code/gauntlet/jarvis/jarvis-ios/jarvis-ios.xcodeproj
```

Or in Xcode:
1. File → Open → Navigate to `jarvis-ios.xcodeproj`
2. Select iPhone 15 Pro simulator (or any iPhone)
3. Press **Cmd + R** to build and run

### Step 2: Grant Permissions

When the app launches, you'll be prompted:
1. ✅ **Microphone Access** - Tap "Allow"
2. ✅ **Speech Recognition** - Tap "Allow"

**Important**: If you deny permissions, speech recognition won't work!

### Step 3: Test Default Mode (Standard Mode)

**Expected Behavior:**
- Recognition mode indicator shows "Standard" with cloud icon ☁️
- Uses Apple's cloud-based recognition
- Best balance of accuracy and privacy

**Test Steps:**
1. Tap the red microphone button
2. Speak clearly: "Hello, can you hear me?"
3. Tap the microphone button again to stop
4. Check the console (Cmd + Shift + Y) for logs:
   ```
   ☁️ Recognition mode: Standard (Apple cloud)
   🎤 Speech recognition started (on-device: false)
   📝 Final transcript: Hello, can you hear me?
   📤 Sending transcript to backend: Hello, can you hear me?
   ```

### Step 4: Test Privacy Mode (On-Device)

**Expected Behavior:**
- On-device recognition only
- Works without internet (try airplane mode!)
- 1-minute time limit (auto-restarts)

**Test Steps:**
1. Tap the gear icon (⚙️) in top-right
2. Under "Speech Recognition Mode", select **Privacy Mode** 🔒
3. Tap "Done"
4. Notice the indicator now shows "Privacy" with lock icon
5. Tap the microphone button and speak
6. Check console:
   ```
   🔒 Recognition mode: Privacy (on-device)
   🎤 Speech recognition started (on-device: true)
   ```

**Test Offline (Bonus):**
1. Enable airplane mode on simulator
2. Try speaking - it should still work!
3. This proves it's truly on-device

### Step 5: Test 1-Minute Timeout (On-Device Only)

**Expected Behavior:**
- After ~60 seconds, recognition auto-restarts
- Brief ~100ms gap, but conversation continues

**Test Steps:**
1. Ensure you're in Privacy Mode
2. Tap microphone to start
3. Keep speaking for over 1 minute (read a long text)
4. Watch console for:
   ```
   ⏱️ On-device recognition timeout - restarting...
   🛑 Speech recognition stopped
   🎤 Speech recognition started (on-device: true)
   ```

### Step 6: Test Mode Switching

**Expected Behavior:**
- Mode changes persist across app restarts
- Switching modes updates recognition immediately

**Test Steps:**
1. Open Settings
2. Switch between Privacy → Standard → Privacy
3. Check console logs for mode changes:
   ```
   🔒 Recognition mode: Privacy (on-device)
   ☁️ Recognition mode: Standard (Apple cloud)
   ```
4. Kill the app (Cmd + Q on simulator)
5. Restart the app
6. Verify your selected mode is still active

### Step 7: Test Professional Mode (Future)

**Current Behavior:**
- Shows in settings but uses WebRTC (not yet fully implemented)
- Will be enabled when backend is ready

**Test Steps:**
1. Select Professional Mode in settings
2. Check console:
   ```
   💼 Recognition mode: Professional (WebRTC)
   ```
3. For now, this mode doesn't transcribe (backend needed)

## Expected Console Output

### Successful Speech Recognition
```
✅ Speech recognition authorized
✅ Audio session configured successfully
📊 Sample rate: 16000Hz
☁️ Recognition mode: Standard (Apple cloud)
🎤 Speech recognition started (on-device: false)
📝 Final transcript: Your spoken text here
📤 Sending transcript to backend: Your spoken text here
🛑 Speech recognition stopped
```

### Permission Denied
```
❌ Speech recognition not authorized
Speech recognition requires microphone permissions
```

### On-Device Timeout
```
⏱️ On-device recognition timeout - restarting...
🛑 Speech recognition stopped
🎤 Speech recognition started (on-device: true)
```

## Known Limitations

### On-Device Mode (Privacy Mode)
- ⏰ **1-minute time limit** - Auto-restarts, ~100ms gap
- 📶 **Lower accuracy** - Compared to cloud mode
- 🔋 **Moderate battery** - Uses Neural Engine

### Cloud Mode (Standard Mode)
- 🌐 **Requires internet** - Won't work offline
- 🔒 **Privacy concern** - Audio sent to Apple servers
- ⚡ **May be throttled** - Apple's unknown rate limits

### Professional Mode
- 🚧 **Not yet implemented** - Requires backend WebRTC/gRPC setup
- 💰 **Will incur costs** - 3rd party STT API fees

## Testing Checklist

- [ ] Build and run without errors
- [ ] Grant microphone permission
- [ ] Grant speech recognition permission
- [ ] Test Standard Mode recognition
- [ ] Test Privacy Mode recognition
- [ ] Test offline (airplane mode) in Privacy Mode
- [ ] Test mode switching in Settings
- [ ] Verify mode persists after app restart
- [ ] Test 1-minute timeout in Privacy Mode
- [ ] Check recognition mode indicator displays correctly
- [ ] Verify transcripts appear in UI
- [ ] Check console logs for expected output

## Troubleshooting

### "Speech recognition permission denied"
**Solution:** Delete the app from simulator and reinstall
```bash
# In Xcode: Product → Clean Build Folder (Cmd + Shift + K)
# Then rebuild: Cmd + R
```

### Transcription not appearing
**Possible causes:**
1. Wrong recognition mode selected (try Standard Mode)
2. Permissions not granted
3. No internet connection (in Standard Mode)
4. Speaking too quietly

**Solution:** Check console logs for errors, restart app

### "Recognition timeout" appearing immediately
**Cause:** This is normal for on-device mode after 1 minute
**Solution:** Switch to Standard Mode for unlimited duration

### Build errors about missing types
**Cause:** Missing imports or file references
**Solution:**
```bash
# Clean derived data
rm -rf ~/Library/Developer/Xcode/DerivedData/jarvis-ios-*
# Rebuild in Xcode
```

## Performance Metrics to Observe

### Latency
- **On-Device**: ~100-150ms (very fast!)
- **Cloud**: ~300-500ms (still good)

### Accuracy
- **On-Device**: Good for clear speech, struggles with accents
- **Cloud**: Excellent for most use cases

### Battery Impact
- **On-Device**: Moderate (uses Neural Engine)
- **Cloud**: Low (mostly network)

## Next Steps After Testing

Once basic testing is complete:

1. **Accuracy Testing** - Test with different:
   - Accents
   - Background noise
   - Speaking speeds
   - Technical vocabulary

2. **Integration Testing** - When backend is ready:
   - Test gRPC message sending
   - Test LLM responses
   - Test full conversation flow

3. **Edge Case Testing**:
   - Very long conversations (>5 minutes)
   - Rapid mode switching
   - Network interruptions
   - Low battery scenarios

4. **User Experience**:
   - Gather feedback on which mode users prefer
   - Measure battery impact over time
   - Test with real use cases

## Success Criteria

✅ Speech recognition works in both Privacy and Standard modes
✅ Transcripts appear correctly in the UI
✅ Mode switching works without crashes
✅ Permissions are requested and handled gracefully
✅ Console logs show expected output
✅ On-device mode works offline
✅ 1-minute timeout is handled gracefully
✅ UI shows correct recognition mode indicator

---

**Ready to Test!** Open the project in Xcode and follow the steps above. Report any issues you find!

**Questions?** Check:
- `docs/ios-native-speech-analysis.md` - Full technical analysis
- `Services/Audio/SpeechRecognitionManager.swift` - Implementation details
- Console logs - Debug information
