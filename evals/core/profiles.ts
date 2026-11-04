import { readFileSync } from 'node:fs';
import type { LlmGateway } from '../../server/llm/index.ts';
import { AnthropicProvider } from '../../server/llm/providers/anthropic.ts';
import { DeepSeekProvider } from '../../server/llm/providers/deepseek.ts';
import { OllamaProvider } from '../../server/llm/providers/ollama.ts';
import { ProviderRegistry } from '../../server/llm/registry.ts';
import { ConfigModelSelector, type ModelSelector } from '../../server/llm/selector.ts';
import { LlmService } from '../../server/llm/service.ts';
import type { ProviderId, Purpose } from '../../server/llm/types.ts';

type Env = Record<string, string | undefined>;

/** One model an eval can run against. `rules` means no model at all: the built-in rule-based triage. Keys are never in the file, only the name of the variable that holds one. */
export type ProfileSpec =
  | { kind: 'rules' }
  | { kind: 'ollama'; url: string; model: string }
  | { kind: 'deepseek'; model: string; apiUrl?: string; apiKeyEnv: string }
  | { kind: 'anthropic'; model: string; apiUrl?: string; apiKeyEnv: string };

export type Profiles = Record<string, ProfileSpec>;

const KINDS = ['rules', 'ollama', 'deepseek', 'anthropic'];

const text = (value: unknown, where: string): string => {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${where} must be a non-empty string`);
  return value.trim();
};

/** Checks the shape of models.json, so a typo fails here and not halfway through a run. */
export function parseProfiles(raw: unknown): Profiles {
  const table = (raw as { profiles?: Record<string, Record<string, unknown>> } | null)?.profiles;
  if (!table || typeof table !== 'object') throw new Error('models.json needs a "profiles" object');
  const out: Profiles = {};
  for (const [name, spec] of Object.entries(table)) {
    const where = `profile "${name}"`;
    const kind = text(spec?.kind, `${where} kind`);
    if (!KINDS.includes(kind)) throw new Error(`${where} has unknown kind "${kind}" (known: ${KINDS.join(', ')})`);
    if (kind === 'rules') out[name] = { kind };
    else if (kind === 'ollama') out[name] = { kind, url: text(spec.url, `${where} url`).replace(/\/+$/, ''), model: text(spec.model, `${where} model`) };
    else {
      const common = {
        model: text(spec.model, `${where} model`),
        apiKeyEnv: text(spec.apiKeyEnv, `${where} apiKeyEnv`),
        ...(spec.apiUrl ? { apiUrl: text(spec.apiUrl, `${where} apiUrl`) } : {}),
      };
      out[name] = kind === 'deepseek' ? { kind, ...common } : { kind: 'anthropic', ...common };
    }
  }
  return out;
}

export const loadProfiles = (path: string): Profiles => parseProfiles(JSON.parse(readFileSync(path, 'utf8')));

/** The model family, used to keep a judge from marking its own family's work. */
export function familyOf(spec: ProfileSpec): string {
  if (spec.kind === 'rules') return 'rules';
  if (spec.kind === 'ollama') return spec.model.split(/[:/-]/)[0] ?? spec.model;
  return spec.kind;
}

/** A selector that sends every purpose to the one provider a profile names. Same interface the app uses, so no server code changes. */
export class EvalModelSelector implements ModelSelector {
  private readonly provider: ProviderId;

  constructor(provider: ProviderId) {
    this.provider = provider;
  }

  providersFor(_purpose: Purpose): readonly ProviderId[] {
    return [this.provider];
  }
}

/** The gateway the app's own code expects, built for one profile. Throws for `rules`, which has no model. */
export function gatewayFor(spec: ProfileSpec, env: Env = process.env): LlmGateway {
  const registry = new ProviderRegistry();
  const key = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`Set ${name} to use this profile`);
    return value;
  };
  switch (spec.kind) {
    case 'rules':
      throw new Error('The rules profile has no model to build a gateway for');
    case 'ollama':
      registry.register('ollama', () => new OllamaProvider({ apiUrl: spec.url, model: spec.model }));
      return new LlmService(new EvalModelSelector('ollama'), registry);
    case 'deepseek': {
      const apiKey = key(spec.apiKeyEnv); // read now, so a missing key fails before the run starts
      registry.register('deepseek', () => new DeepSeekProvider({ apiUrl: spec.apiUrl ?? 'https://api.deepseek.com', apiKey, model: spec.model }));
      return new LlmService(new EvalModelSelector('deepseek'), registry);
    }
    case 'anthropic': {
      const apiKey = key(spec.apiKeyEnv);
      registry.register('anthropic', () => new AnthropicProvider({ apiUrl: spec.apiUrl ?? 'https://api.anthropic.com', apiKey, model: spec.model }));
      return new LlmService(new EvalModelSelector('anthropic'), registry);
    }
  }
}

/** A short label for reports: the exact model tag. */
export const describeProfile = (name: string, spec: ProfileSpec): string =>
  spec.kind === 'rules' ? `${name} (rule-based, no model)` : `${name} (${spec.kind}: ${spec.model})`;
