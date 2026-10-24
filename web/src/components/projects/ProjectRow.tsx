import { ArrowRight, CircleCheck, CircleDashed, Copy, GitBranch, Loader2, RotateCw, Settings, Trash2, TriangleAlert, type LucideIcon } from 'lucide-react';
import { ExternalLink } from '@/components/Bits';
import { Pipeline } from '@/components/Pipeline';
import { StateLabel } from '@/components/StatusLabel';
import { Button, buttonVariants } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ProjectView, SetupStatus, TrackerProjectGroup } from '@/lib/api';
import { copy } from '@/lib/copy';
import { formatRelative } from '@/lib/format';
import { projectHref } from '@/hooks/useProjectRoute';
import { connectionOf } from '@/lib/connection';
import { ConnectionButton, ConnectionNote, RefusalNote } from '@/components/projects/ConnectionStatus';
import { funnel } from '@/lib/lifecycle';
import { cn } from '@/lib/utils';

const c = copy.projects;

const SETUP: Record<SetupStatus['state'], { label: string; icon: LucideIcon; tone: string; spin?: boolean }> = {
  idle: { label: c.setup.idle, icon: CircleDashed, tone: 'text-status-stopped' },
  working: { label: c.setup.working, icon: Loader2, tone: 'text-chart-1', spin: true },
  ready: { label: c.setup.ready, icon: CircleCheck, tone: 'text-status-running' },
  failed: { label: c.setup.failed, icon: TriangleAlert, tone: 'text-status-crashed' },
};

/**
 * Where the clone has got to. On a card it stays silent when all is well (Ready), speaking up only when something
 * needs attention; `always` is for the page's setup section, where Ready is the answer being looked for.
 */
export function SetupLabel({ setup, always = false }: { setup: SetupStatus; always?: boolean }) {
  if (setup.state === 'ready' && !always) return null;
  const { label, icon, tone, spin } = SETUP[setup.state];
  return (
    <StateLabel icon={icon} tone={tone} spin={spin} data-setup={setup.state}>
      {label}
    </StateLabel>
  );
}

export function IconAction({ label, icon: Icon, onClick, disabled, destructive }: { label: string; icon: LucideIcon; onClick: () => void; disabled?: boolean; destructive?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className={cn('size-8 pointer-coarse:size-11', destructive && 'hover:text-destructive')} aria-label={label} disabled={disabled} onClick={onClick}>
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

interface Props {
  project: ProjectView;
  /** The project's errors, when the tracker has any for it. */
  group: TrackerProjectGroup | undefined;
  busy: boolean;
  onConnect: () => void;
  onCopyDsn: () => void;
  onRetry: () => void;
  onSettings: () => void;
  onDelete: () => void;
}

/**
 * One project in the list: who it is, how far its errors get through the pipeline, and the few things to do with it.
 * Counts only; the errors themselves are on the project's own page, so a noisy project never makes its row taller.
 */
export function ProjectRow({ project, group, busy, onConnect, onCopyDsn, onRetry, onSettings, onDelete }: Props) {
  const issues = group?.issues ?? [];
  const connection = connectionOf(group);
  const canRetry = project.branch !== null && (project.setup.state === 'failed' || project.setup.state === 'idle');
  const headingId = `project-${project.id}`;

  return (
    <li className="space-y-3 p-4 sm:px-6" role="region" aria-labelledby={headingId} data-project={project.id}>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)_auto]">
        <div className="min-w-0 space-y-2">
          <h3 id={headingId} className="flex min-w-0 items-center gap-2 text-base font-semibold">
            <a href={projectHref(project.id)} className="truncate rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50">
              {project.repo}
            </a>
            <ExternalLink href={`https://github.com/${project.repo}`} label={c.repoLink(project.repo)} className="shrink-0">
              <span className="sr-only">GitHub</span>
            </ExternalLink>
          </h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="inline-flex items-center gap-1 font-mono text-sm text-muted-foreground">
              <GitBranch className="size-3.5" aria-hidden />
              {project.branch ?? (
                <>
                  —<span className="sr-only"> ({c.branchPending})</span>
                </>
              )}
            </span>
            <SetupLabel setup={project.setup} />
          </div>
        </div>

        <Pipeline counts={funnel(issues)} compact />

        <div className="-mr-2 flex shrink-0 lg:-mt-1">
          {canRetry && <IconAction label={c.actions.forProject(project.setup.state === 'failed' ? c.actions.retry : c.actions.cloneNow, project.repo)} icon={RotateCw} disabled={busy} onClick={onRetry} />}
          <IconAction label={c.actions.forProject(c.actions.settings, project.repo)} icon={Settings} disabled={busy} onClick={onSettings} />
          {/* Keeps Delete apart from Settings, so a slip of the pointer does not land on it. */}
          <span className="mx-2 my-2 w-px bg-border" aria-hidden />
          <IconAction label={c.actions.forProject(c.actions.delete, project.repo)} icon={Trash2} destructive disabled={busy} onClick={onDelete} />
        </div>
      </div>

      {project.setup.state !== 'ready' && project.setup.state !== 'idle' && (
        <p className="text-sm text-muted-foreground" role={project.setup.state === 'failed' ? 'alert' : undefined}>
          {project.setup.message}
        </p>
      )}

      <RefusalNote connection={connection} />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {project.dsn ? <ConnectionNote connection={connection} /> : c.card.quiet.noDsn}
          {issues.length > 0 && group && (
            <>
              <span aria-hidden>·</span>
              <span>
                {c.card.total(group.issueCount, group.eventCount)}
                {group.lastSeen && <> · {copy.errors.project.lastSeen(formatRelative(group.lastSeen))}</>}
              </span>
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {project.dsn && (
            <>
              <ConnectionButton connection={connection} onClick={onConnect} />
              <Button variant="outline" size="sm" onClick={onCopyDsn}>
                <Copy className="size-4" aria-hidden />
                {c.card.copyDsn}
              </Button>
            </>
          )}
          {issues.length > 0 && (
            <a href={projectHref(project.id)} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              {c.card.viewErrors}
              <ArrowRight className="size-4" aria-hidden />
            </a>
          )}
        </div>
      </div>
    </li>
  );
}
