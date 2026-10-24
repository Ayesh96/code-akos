import type { ProjectView, TrackerProjectGroup } from '@/lib/api';
import { funnel } from '@/lib/lifecycle';

/** Errors that have not reached an open pull request yet. */
const waiting = (group: TrackerProjectGroup | undefined): number => {
  const counts = funnel(group?.issues ?? []);
  return (counts[0] ?? 0) - (counts[counts.length - 1] ?? 0);
};

/**
 * Projects in the order a person should look at them: a clone that failed, then the most errors still without a
 * pull request, then the rest by name. The list never reorders itself on a poll unless these facts change.
 */
export function byAttention(projects: ProjectView[], groups: TrackerProjectGroup[] | null): ProjectView[] {
  const group = (p: ProjectView) => groups?.find((g) => g.projectId === p.id);
  const failed = (p: ProjectView) => (p.setup.state === 'failed' ? 1 : 0);
  return [...projects].sort((a, b) => failed(b) - failed(a) || waiting(group(b)) - waiting(group(a)) || a.repo.localeCompare(b.repo));
}
