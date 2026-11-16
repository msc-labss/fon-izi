/**
 * robots.txt rules, following RFC 9309.
 *
 * - The group whose user-agent matches our product token wins; otherwise
 *   every `*` group applies.
 * - The longest matching rule decides; on a tie, Allow wins.
 * - `*` matches any run of characters and a trailing `$` anchors the end.
 *
 * What happens when robots.txt itself cannot be read is decided by the
 * caller (see `rulesFromResponse`).
 */

export interface Rule {
  allow: boolean;
  pattern: string;
}

export interface RobotsRules {
  /** `all-allowed`: no robots.txt (4xx). `all-disallowed`: unreachable (5xx, network, other). */
  mode: 'rules' | 'all-allowed' | 'all-disallowed';
  rules: Rule[];
}

/** Parses robots.txt and returns the rules that apply to `agent`. */
export function parseRobots(text: string, agent: string): RobotsRules {
  const token = agent.toLowerCase();
  type Group = { agents: string[]; rules: Rule[] };
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && current) {
      lastWasAgent = false;
      if (value === '') continue; // an empty Disallow allows everything
      current.rules.push({ allow: key === 'allow', pattern: value });
    } else {
      lastWasAgent = false;
    }
  }
  const own = groups.filter((g) => g.agents.some((a) => a !== '*' && token.includes(a)));
  const chosen = own.length ? own : groups.filter((g) => g.agents.includes('*'));
  return { mode: 'rules', rules: chosen.flatMap((g) => g.rules) };
}

/** Rules from the robots.txt response status (RFC 9309 section 2.3.1). */
export function rulesFromResponse(status: number | null, text: string, agent: string): RobotsRules {
  if (status !== null && status >= 200 && status < 300) return parseRobots(text, agent);
  if (status !== null && status >= 400 && status < 500) return { mode: 'all-allowed', rules: [] };
  return { mode: 'all-disallowed', rules: [] };
}

function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/** Whether `pathAndQuery` (e.g. `/tr/fon-getirileri?x=1`) may be fetched. */
export function isAllowed(pathAndQuery: string, robots: RobotsRules): boolean {
  if (robots.mode === 'all-allowed') return true;
  if (robots.mode === 'all-disallowed') return false;
  let best: Rule | null = null;
  for (const rule of robots.rules) {
    if (!patternToRegExp(rule.pattern).test(pathAndQuery)) continue;
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) best = rule;
  }
  return best ? best.allow : true;
}
