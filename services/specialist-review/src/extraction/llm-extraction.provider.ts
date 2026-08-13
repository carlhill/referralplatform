import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ExtractionInput, ExtractionOutput, ExtractionProvider } from './extraction-provider.interface';
import { RuleBasedExtractionProvider } from './rule-based-extraction.provider';

/**
 * MOCK — replace with real integration.
 *
 * This is the "how a real LLM-based provider would be plugged in later"
 * half of the pluggable ExtractionProvider interface. It demonstrates the
 * real shape of the integration — an OpenAI-chat-completions-compatible
 * HTTP call with a JSON-mode extraction prompt, selected via
 * `EXTRACTION_PROVIDER=llm` (see extraction.module.ts) — but this build has
 * no real LLM API credentials to call against (no `LLM_API_KEY` is issued
 * in any environment this was built in), so:
 *
 *   - If `LLM_API_KEY` is configured, `extract()` makes the real HTTP call
 *     below. This code path is genuine, working request/response handling
 *     against any OpenAI-compatible `/chat/completions` endpoint (OpenAI
 *     itself, Azure OpenAI, Anthropic's OpenAI-compat endpoint, a
 *     self-hosted vLLM/Ollama server, etc.) — it has NOT been exercised
 *     against a live vendor in this sandbox (no credentials, and outbound
 *     access to most LLM vendor hosts is blocked by this build
 *     environment's egress policy — see BUILD_LOG/specialist-review.md).
 *     Treat it as reviewed-but-unverified, not production-proven.
 *   - If `LLM_API_KEY` is NOT configured (the default in every
 *     `.env.example` in this repo), `extract()` logs a clear warning and
 *     delegates to `RuleBasedExtractionProvider` instead of throwing or
 *     silently returning empty data — this is the "working mock/stub
 *     implementation" required for any integration needing real-world
 *     credentials that this build can't provide.
 *
 * Whichever path runs, the provider `name` returned always reflects what
 * actually produced the data (`llm-v1` vs `rule-based-v1-fallback`), so
 * ExtractionResult rows are never mislabelled.
 */
@Injectable()
export class LlmExtractionProvider implements ExtractionProvider {
  private readonly logger = new Logger(LlmExtractionProvider.name);
  private ranAsFallback = false;

  constructor(
    private readonly config: ConfigService,
    private readonly fallback: RuleBasedExtractionProvider,
  ) {}

  get name(): string {
    return this.ranAsFallback ? 'rule-based-v1-fallback' : 'llm-v1';
  }

  async extract(input: ExtractionInput): Promise<ExtractionOutput> {
    const apiKey = this.config.get<string>('LLM_API_KEY');
    const apiUrl = this.config.get<string>('LLM_API_URL', 'https://api.openai.com/v1/chat/completions');
    const model = this.config.get<string>('LLM_MODEL', 'gpt-4o-mini');

    if (!apiKey) {
      this.logger.warn(
        'LlmExtractionProvider selected but LLM_API_KEY is not configured — MOCK fallback: delegating to ' +
          'RuleBasedExtractionProvider. Set LLM_API_KEY (and optionally LLM_API_URL/LLM_MODEL) to exercise the real call.',
      );
      this.ranAsFallback = true;
      return this.fallback.extract(input);
    }

    this.ranAsFallback = false;
    const prompt = this.buildExtractionPrompt(input);

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'You extract structured administrative fields from a GP referral letter for a specialist to review. ' +
              'You NEVER diagnose, triage, or add clinical judgement beyond what is written — you only transcribe ' +
              'and organise what is already in the text. Return strict JSON matching the requested schema.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`LLM extraction API responded ${res.status}: ${await res.text()}`);
    }

    const body = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    const raw = body.choices?.[0]?.message?.content;
    if (!raw) {
      throw new Error('LLM extraction API returned no content');
    }

    const parsed = JSON.parse(raw) as Partial<ExtractionOutput>;
    return {
      patient: parsed.patient ?? {},
      reasonForReferral: parsed.reasonForReferral,
      keyHistory: parsed.keyHistory ?? [],
      medications: parsed.medications ?? [],
      referringGp: parsed.referringGp ?? {},
      urgencyIndicators: parsed.urgencyIndicators ?? [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      warnings: parsed.warnings ?? [],
    };
  }

  private buildExtractionPrompt(input: ExtractionInput): string {
    return (
      'Extract the following fields as JSON from this referral letter: ' +
      'patient {name, dateOfBirth, sex, otherIdentifiers[]}, reasonForReferral, keyHistory[], medications[], ' +
      'referringGp {name, practice, providerNumber, contact}, urgencyIndicators[] (only phrases literally present ' +
      'in the text that suggest urgency — do not infer clinical urgency yourself), confidence (0-1), warnings[] ' +
      '(fields you could not find).\n\n' +
      (input.reasonForReferralHint
        ? `Structured reason-for-referral hint from the referral system: ${input.reasonForReferralHint}\n\n`
        : '') +
      `Referral letter text:\n${input.referralText}`
    );
  }
}
