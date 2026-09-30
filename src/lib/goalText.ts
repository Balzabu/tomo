// Localised labels for goals, shared by the goals tab and the widgets.
import type { Goal, GoalMetric } from '@/types';
import type { TFunc } from '@/i18n';

/** "libro"/"libri", "pagina"/"pagine", "min". */
export function unitFor(metric: GoalMetric, n: number, tr: TFunc): string {
  if (metric === 'minutes') return tr('unit.min');
  if (metric === 'books') return n === 1 ? tr('unit.book') : tr('unit.books');
  return n === 1 ? tr('unit.page') : tr('unit.pages');
}

export function goalTitle(goal: Goal, tr: TFunc): string {
  if (goal.period === 'custom') {
    return goal.name || tr('goals.challengeDefault', { n: goal.target, unit: unitFor(goal.metric, goal.target, tr) });
  }
  return tr(`goals.title.${goal.metric}.${goal.period}`);
}

