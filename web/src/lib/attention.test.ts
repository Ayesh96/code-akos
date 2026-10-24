import { describe, expect, it } from 'vitest';
import type { ProjectView, TrackerProjectGroup } from '@/lib/api';
import { byAttention } from '@/lib/attention';

const project = (id: string, repo: string, setup: string = 'ready') => ({ id, repo, setup: { state: setup } }) as unknown as ProjectView;
const group = (projectId: string, resolverStatuses: (string | null)[]) =>
  ({ projectId, issues: resolverStatuses.map((resolverStatus) => ({ githubIssueNumber: null, resolverStatus, triageStatus: 'PENDING' })) }) as unknown as TrackerProjectGroup;

describe('byAttention', () => {
  it('puts a failed clone first, then the project with the most errors still waiting, then by name', () => {
    const list = [project('a', 'o/alpha'), project('b', 'o/beta'), project('c', 'o/gamma', 'failed'), project('d', 'o/delta')];
    const groups = [group('b', [null, null, null]), group('d', [null, 'PR_OPEN'])];
    expect(byAttention(list, groups).map((p) => p.id)).toEqual(['c', 'b', 'd', 'a']);
  });

  it('keeps name order when nothing is known yet', () => {
    expect(byAttention([project('b', 'o/b'), project('a', 'o/a')], null).map((p) => p.id)).toEqual(['a', 'b']);
  });
});
