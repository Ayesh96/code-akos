import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EvalModelSelector, familyOf, gatewayFor, loadProfiles, parseProfiles } from '../../evals/core/profiles.ts';

describe('eval model profiles', () => {
  it('loads the shipped models.json, with a model-free rules profile and the Mac mini model', () => {
    const profiles = loadProfiles(new URL('../../evals/models.json', import.meta.url).pathname);
    assert.deepEqual(profiles.rules, { kind: 'rules' });
    assert.deepEqual(profiles['qwen3-14b'], { kind: 'ollama', url: 'http://localhost:11434', model: 'qwen3:14b' });
  });

  it('rejects a typo before a run starts', () => {
    assert.throws(() => parseProfiles({}), /needs a "profiles" object/);
    assert.throws(() => parseProfiles({ profiles: { a: { kind: 'gpt' } } }), /unknown kind "gpt"/);
    assert.throws(() => parseProfiles({ profiles: { a: { kind: 'ollama', url: 'http://x' } } }), /model must be a non-empty string/);
    assert.throws(() => parseProfiles({ profiles: { a: { kind: 'deepseek', model: 'm' } } }), /apiKeyEnv/);
  });

  it('keeps a key out of the file: only the variable name is stored, and a missing variable is a clear error', () => {
    const spec = parseProfiles({ profiles: { d: { kind: 'deepseek', model: 'm', apiKeyEnv: 'MY_KEY' } } }).d!;
    assert.throws(() => gatewayFor(spec, {}), /Set MY_KEY/);
    assert.ok(gatewayFor(spec, { MY_KEY: 'k' }).isAvailable('triage'));
  });

  it('builds an Ollama gateway without touching the network, and refuses to build one for rules', () => {
    const gateway = gatewayFor({ kind: 'ollama', url: 'http://localhost:11434', model: 'qwen3:14b' });
    assert.equal(gateway.isAvailable('triage'), true);
    assert.equal(gateway.isAvailable('resolver'), true);
    assert.throws(() => gatewayFor({ kind: 'rules' }), /no model/);
  });

  it('sends every purpose to the one provider named', () => {
    assert.deepEqual(new EvalModelSelector('anthropic').providersFor('triage'), ['anthropic']);
    assert.deepEqual(new EvalModelSelector('anthropic').providersFor('resolver'), ['anthropic']);
  });

  it('names the model family, so a judge can be kept from grading its own family', () => {
    assert.equal(familyOf({ kind: 'ollama', url: 'u', model: 'qwen3:14b' }), 'qwen3');
    assert.equal(familyOf({ kind: 'ollama', url: 'u', model: 'qwen2.5-coder:7b' }), 'qwen2.5');
    assert.equal(familyOf({ kind: 'anthropic', model: 'm', apiKeyEnv: 'K' }), 'anthropic');
  });
});
