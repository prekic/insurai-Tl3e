# 021 - Gemini Multimodal OCR Integration

## Context
Historically, the insurai extraction pipeline operated sequentially:
1. `Cloud Vision / Document AI` extracted unstructured text from PDFs/images.
2. The raw text was passed to Anthropic (primary) or OpenAI (fallback) for structured JSON extraction.

With the release of Gemini 2.5 Flash, Google's generative models offer exceptionally fast and accurate multimodal capabilities, specifically direct image-to-JSON OCR without a prior text extraction step. A P2 audit item requested integrating the Gemini SDK as a tertiary provider. 

We needed to decide how to integrate Gemini: either retrofit it into the existing two-step pipeline, or create a dedicated single-pass multimodal route. Additionally, we had to choose between the deprecated `@google/generative-ai` SDK and the modern `@google/genai` SDK.

## Decision
1. **SDK Choice**: We selected the modern `@google/genai` SDK over the legacy `@google/generative-ai` library.
2. **Architecture**: We implemented a new, distinct endpoint (`POST /api/ai/ocr/gemini`) that handles single-pass multimodal OCR and extraction. This bypasses the traditional Cloud Vision step entirely when invoked.
3. **Integration Strategy**: The new Gemini endpoint is additive. It serves as a tertiary option and an alternative OCR path that the frontend orchestrator can conditionally route to, while the established Cloud Vision + Anthropic/OpenAI pipeline remains the primary mechanism until further pilot validation.
4. **Lazy Initialization**: Following established patterns, we implemented `getGeminiClient()` as a lazy factory to prevent server crash loops if `GEMINI_API_KEY` is missing in certain environments, enforcing the singleton pattern for efficiency.

## Consequences
- **Positive**: Enables single-pass multimodal extraction which may significantly reduce latency and cost for document parsing.
- **Positive**: Keeps the platform modern and resilient by introducing a third state-of-the-art provider (alongside Anthropic and OpenAI).
- **Negative**: Adds a new required environment variable (`GEMINI_API_KEY`) to production deployments, distinct from the GCP Service Account credentials used for Document AI.
- **Negative**: The frontend orchestration logic will need to become slightly more complex to route documents either to the standard OCR pipeline or the new Gemini multimodal pipeline.
