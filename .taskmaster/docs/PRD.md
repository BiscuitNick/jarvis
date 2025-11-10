# Product Requirements Document (PRD)
**Project:** Jarvis — Real-Time Voice Assistant  
**Organization:** Frontier Audio  
**Project ID:** VyuiwBOFxfoySBVh4b7D_1762227805787  

---

## 1. Executive Summary

**Jarvis** is a real-time, voice-first assistant that empowers frontline and operations personnel to access accurate information instantly. Built atop managed frontier LLMs with cloud speech services, Jarvis delivers near-zero-latency responses and contextually grounded answers. The MVP targets reliability, natural conversational flow, and verifiable accuracy — emphasizing speech-to-action performance over feature depth.

---

## 2. Problem Statement

Frontline and operations staff often need quick, reliable access to critical data but face delays from traditional systems. Existing voice solutions suffer from latency, inaccuracy, or limited domain awareness. Jarvis bridges this gap with a fast, accurate, LLM-powered assistant that can listen, think, and respond in real time while staying verifiably correct for mission-critical use cases.

---

## 3. Goals & Success Metrics

| Metric | Target |
|--------|--------|
| **Accuracy** | ≥95% verified correctness for retrieval-based answers |
| **Latency** | <500 ms to first token; responses stream progressively |
| **Clarity** | ≥90% of feedback rates answers clear & actionable |
| **Usability** | ≥80% of testers operate effectively within 30 min training |
| **Interruptibility** | <150 ms barge-in reaction time (client-side VAD trigger) |

---

## 4. Target Users & Personas

- **Frontline Workers** — need instant answers to operational or technical questions.  
- **Supervisors / Team Leads** — monitor and coordinate, rely on real-time communication.  
- **Support / IT Staff** — maintain integrations, ensure data fidelity and uptime.

---

## 5. User Stories

1. As a worker, I want to ask Jarvis a spoken question and get a fast, accurate answer without using my hands.  
2. As a team lead, I want Jarvis to retrieve verified data from our knowledge sources so I can trust its guidance.  
3. As a support engineer, I want simple setup and logging so I can diagnose errors quickly.  

---

## 6. Functional Requirements

### **P0 — Must-Have**
1. **Real-time speech pipeline**: wake-word activation (“Jarvis”), client-side VAD, barge-in support.  
2. **Cloud ASR / TTS** with streaming for sub-500 ms first-token latency.  
3. **LLM response engine** (managed frontier model) with retrieval-only answers for critical intents.  
4. **Contextual memory (short-term)** per session for natural follow-ups.  
5. **Retrieval grounding** using pgvector-based knowledge index with citation metadata.  
6. **Cloud API integrations** (GitHub read-only, other public data) refreshed every 3 min.  
7. **Audible or textual cue** (“Let me check for you…”) for longer reasoning tasks.  
8. **User interruptibility** via client-side VAD (local detection of speech start/stop).  

### **P1 — Should-Have**
1. **Hybrid planning layer**: pre-defined multi-step workflows (e.g., retrieve → summarize).  
2. **Basic admin configuration panel** (source paths, API keys, logs).  
3. **Simple usage analytics** (latency, ASR WER, grounding rate).  

### **P2 — Nice-to-Have**
1. **Passive listening mode** (opt-in, privacy indicator).  
2. **Custom voice personalities or speed settings.**  
3. **Optional mobile widget / quick-launch shortcut.**

---

## 7. Non-Functional Requirements

| Category | Requirement |
|-----------|-------------|
| **Performance** | Maintain <500 ms first-token latency; <150 ms barge-in reaction. |
| **Scalability** | Support 10 concurrent users without degradation. |
| **Reliability** | ≥99% uptime target for core APIs. |
| **Security (MVP)** | Cloud-processed audio & transcripts over HTTPS; no encryption-at-rest requirement for MVP. |
| **Privacy** | Incognito/simple auth; transient session memory (no long-term retention). |
| **Compliance** | GDPR/PII out-of-scope for MVP. |

---

## 8. User Experience & Design

- **Voice-first interaction** with minimal visual UI.  
- **Immediate feedback**: wake-tone and streaming partials (“thinking…”).  
- **Audible interruption handling** — playback pauses instantly when user begins speaking.  
- **Simple iOS interface**: waveform, microphone button, transcript stream, and “sources” button for citation view.  
- **Accessibility**: clear voice output, adjustable playback rate, and minimal on-screen clutter.

---

## 9. Technical Architecture

### **Overview**
- **Mobile Client:** Native iOS app only with wake-word listener + local VAD module (WebRTC-VAD or RNNoise).  
- **Transport:**  
  - Audio streaming via WebRTC data/audio channel.  
  - Control messages via gRPC/HTTP2.  
- **Backend (AWS ECS/Fargate):**  
  - **Ingress Service:** handles audio chunks & session control.  
  - **ASR Gateway:** streams to cloud ASR (e.g., Deepgram, Google, Azure).  
  - **LLM Router:** routes to managed frontier model (OpenAI/Anthropic).  
  - **RAG Service:** Postgres + pgvector retrieval with citation injection.  
  - **TTS Service:** streams cloud neural TTS audio back to client.  
  - **Logging Service:** minimal input/output JSON logs.  
- **Data Storage:**  
  - **Aurora Postgres** for users, logs, embeddings (pgvector).  
  - No multi-tenancy; single-tenant MVP schema.  
- **Authentication:**  
  - Simple incognito or device token auth.  
  - No SSO, no RBAC.  

---

## 10. AI & Reasoning Layer

### **Model Selection**
- Managed frontier LLM (e.g., GPT-4o, Claude, or Gemini) via API streaming.  
- System prompt enforces retrieval-only answers for critical intents; relaxed reasoning allowed for casual dialogue.  

### **Retrieval & Grounding**
- Knowledge indexed with pgvector; each response includes citation list.  
- If no valid grounding, Jarvis replies: “I don’t have verified information on that.”  

### **Planning / Agents**
- **Hybrid policy (Option C)**  
  - Default: single-turn function routing (fast).  
  - For specific workflows (e.g., *Fetch GitHub issues → Summarize*), backend executes a **predefined 2-step chain**.  
  - No open-ended self-planning or recursive agent loops.  
  - Hard cap: 2 steps / 10 seconds max per query.  

---

## 11. Security, Privacy, and Compliance

- **Transport:** HTTPS / secure WebRTC.  
- **At-Rest:** No encryption required for MVP; logs stored transiently.  
- **Auth:** Temporary incognito or device-ID tokens only.  
- **Data Retention:** 24-hour log TTL; no PII storage.  
- **Governance:** No multi-tenant or role-based access yet; single-tenant instance assumed.  
- **Audit:** Simple request/response JSON logging (no cryptographic signing).  

---

## 12. Observability & Metrics

| Category | Metrics |
|-----------|----------|
| **Performance** | First-token latency (p50/p95), end-to-end latency, VAD reaction time |
| **Speech Quality** | Word Error Rate (WER), false-barge-in rate |
| **LLM Reliability** | Grounding success %, refusal rate, streaming error rate |
| **Usage** | Session count, query length, “thinking” event frequency |
| **System Health** | CPU/mem usage per service, ASR/TTS API errors |

---

## 13. Dependencies & Assumptions

- Stable Wi-Fi connectivity.  
- Access to public GitHub repositories & APIs.  
- iOS devices with microphone and headset support.  
- Frontier LLM API credentials available.  
- Managed AWS infrastructure (ECS + Aurora) configured.  

---

## 14. Out of Scope (MVP)

- Android or cross-platform mobile clients.  
- Hardware manufacturing or custom wearable integration.  
- Multi-language support.  
- Multi-tenancy, RBAC, or org-level dashboards.  
- Automated PR creation or repo write actions.  
- Enterprise encryption, compliance, or audit frameworks.  
- Full admin UI (limited to configuration panel).  

---

## 15. Future Extensions (Post-MVP)

- On-device ASR/TTS for offline and private mode.  
- Android app parity.  
- Multi-tenant org separation with RBAC & SSO.  
- Continuous learning from feedback loops.  
- Passive listening with privacy indicators.  
- Rich admin console with analytics & policy management.  
- Expanded multi-step planning and external action APIs.  

---

### ✅ MVP Philosophy
Jarvis MVP prioritizes **responsiveness, reliability, and verified correctness** over automation breadth.  
Every millisecond saved and every hallucination avoided contributes directly to trust — the core product differentiator for Frontier Audio’s real-time voice intelligence platform.
