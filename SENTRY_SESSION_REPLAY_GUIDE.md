# Sentry Session Replay - Configuration & Usage Guide

## ✅ Current Status

**Session Replay is already configured!** Your `sentry.client.config.ts` includes:
- ✅ `replayIntegration()` added
- ✅ `replaysOnErrorSampleRate: 1.0` (100% of error sessions)
- ✅ `replaysSessionSampleRate: 0.1` (10% of all sessions)
- ✅ Privacy settings: `maskAllText: true`, `blockAllMedia: true`

---

## 🎥 How Session Replay Works

### What It Does:
Session Replay records user interactions in your application, creating a video-like replay of what happened before, during, and after an error occurred.

### What You'll See:
1. **Visual Timeline** - See exactly what the user clicked, typed, and viewed
2. **DOM Changes** - Watch elements appear/disappear
3. **Network Requests** - See API calls that failed
4. **Console Logs** - View console errors and warnings
5. **User Actions** - Clicks, scrolls, form inputs (masked for privacy)

### How It Helps Debug:
- **Pinpoint Exact Problems**: See the exact sequence of actions that led to an error
- **Reproduce Issues**: Watch the replay to understand what the user was doing
- **Identify Patterns**: See if multiple users hit the same issue the same way
- **Context**: Understand the full user journey, not just the error stack trace

---

## 📊 Current Configuration Explained

### Sampling Rates:

```typescript
replaysSessionSampleRate: 0.1  // 10% of all sessions
replaysOnErrorSampleRate: 1.0  // 100% of sessions with errors
```

**What This Means:**
- **10% of all sessions** are recorded (random sampling)
- **100% of sessions with errors** are recorded (every error gets a replay)
- This balances performance with coverage

**Recommendation:**
- Keep `replaysOnErrorSampleRate: 1.0` (always record errors)
- Adjust `replaysSessionSampleRate` based on traffic:
  - Low traffic: `0.5` (50%) or `1.0` (100%)
  - High traffic: `0.1` (10%) is good
  - Very high traffic: `0.05` (5%)

### Privacy Settings:

```typescript
maskAllText: true   // All text is masked (privacy)
blockAllMedia: true // Images/videos blocked (privacy)
```

**What This Means:**
- User input (emails, names, etc.) is automatically masked
- Images and videos are blocked from recording
- Sensitive data is protected

**If You Need More Visibility:**
- Set `maskAllText: false` to see text (be careful with sensitive data!)
- Set `blockAllMedia: false` to record media (privacy concern)

---

## 🔍 How to Use Session Replay

### 1. View Replays in Sentry Dashboard

1. **Go to Sentry Dashboard** → `selftaughtorg.sentry.io`
2. **Click on an Issue** (any error)
3. **Look for "Replay" tab** or "Session Replay" section
4. **Click "View Replay"** to watch the session

### 2. What You'll See in a Replay

- **Timeline**: Scrollable timeline showing the session
- **User Actions**: Highlighted clicks, scrolls, form inputs
- **Error Moment**: Red marker showing when the error occurred
- **Before/After**: See what happened before and after the error
- **Console Logs**: Errors and warnings in the console
- **Network Activity**: Failed API calls

### 3. Example Use Cases

**Scenario 1: Task Completion Error**
- User clicks "Complete Task"
- Error occurs
- **Replay shows**: Exact button clicked, form data entered, API call that failed

**Scenario 2: Dashboard Loading Issue**
- Dashboard doesn't load for some users
- **Replay shows**: What page they were on, what they clicked, network requests that failed

**Scenario 3: Form Submission Error**
- Form submission fails
- **Replay shows**: What fields were filled, validation errors, API response

---

## 🎯 Pinpointing Exact Problems

### Yes, Session Replay Helps Pinpoint Problems!

**Before Session Replay:**
- ❌ You see: "Error: Cannot read property 'id' of undefined"
- ❌ You know: Something broke, but not what the user was doing

**With Session Replay:**
- ✅ You see: User clicked "Complete Task" on a Holds task
- ✅ You see: They selected "Unable to Resolve" disposition
- ✅ You see: The API call to `/api/agent/tasks/[id]/complete` failed
- ✅ You see: The error occurred at line 178 in `complete/route.ts`
- ✅ **You know exactly what happened!**

### Example Workflow:

1. **Error Occurs** → Sentry captures it
2. **Session Replay** → Automatically recorded (100% for errors)
3. **You Investigate** → Click "View Replay" in Sentry
4. **Watch Replay** → See exact user actions
5. **Identify Root Cause** → Understand the sequence of events
6. **Fix the Issue** → Make targeted fix based on what you saw

---

## ⚙️ Configuration Options

### Current Settings (Recommended):

```typescript
Sentry.replayIntegration({
  maskAllText: true,      // Privacy: mask all text
  blockAllMedia: true,    // Privacy: block images/videos
})
```

### Alternative Settings (More Visibility, Less Privacy):

```typescript
Sentry.replayIntegration({
  maskAllText: false,     // Show text (be careful!)
  blockAllMedia: false,   // Show media (privacy risk)
  maskAllInputs: true,    // Still mask form inputs
  blockSelector: '.sensitive', // Block specific elements
})
```

### Advanced Options:

```typescript
Sentry.replayIntegration({
  maskAllText: true,
  blockAllMedia: true,
  // Only record specific pages
  networkDetailAllowUrls: ['/api/agent', '/api/holds'],
  // Ignore certain elements
  ignoreClass: 'no-replay',
  // Record more detail
  recordCanvas: true,
})
```

---

## 📈 Performance Impact

### Current Configuration Impact:
- **Minimal**: 10% of sessions recorded (random sampling)
- **Error Sessions**: 100% recorded (but errors are rare)
- **Bandwidth**: ~50-200KB per replay (compressed)
- **CPU**: Negligible impact on user experience

### Monitoring:
- Check Sentry dashboard for replay storage usage
- Adjust `replaysSessionSampleRate` if needed
- Monitor for any performance issues

---

## 🚀 Next Steps

### 1. Test Session Replay (After Next Deployment)

1. **Trigger a test error** in production
2. **Go to Sentry** → Find the error
3. **Click "Replay"** tab
4. **Watch the replay** to verify it's working

### 2. Adjust Sampling (Optional)

If you want more coverage:
```typescript
replaysSessionSampleRate: 0.2  // 20% instead of 10%
```

If you want less (high traffic):
```typescript
replaysSessionSampleRate: 0.05  // 5% instead of 10%
```

### 3. Customize Privacy (Optional)

If you need to see more detail:
```typescript
maskAllText: false,  // Show text (review privacy implications)
```

---

## ✅ Summary

**Session Replay is already configured and ready!**

**What You Get:**
- ✅ 100% of error sessions recorded
- ✅ 10% of all sessions recorded (random)
- ✅ Privacy protection (text masked, media blocked)
- ✅ Full user journey visibility

**How It Helps:**
- ✅ Pinpoint exact problems
- ✅ See what users were doing when errors occurred
- ✅ Reproduce issues easily
- ✅ Understand context around errors

**After Next Deployment:**
- Session Replay will automatically start recording
- Errors will have replays attached
- You can view replays in the Sentry dashboard

---

**Ready to use!** 🎥 Just wait for the next deployment and start viewing replays in Sentry!

