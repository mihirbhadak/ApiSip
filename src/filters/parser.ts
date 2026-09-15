import { compileFilter, operators, type FilterNode, type Operator } from './engine';
type Token = { text: string; quoted: boolean };
export function parseFilter(expression: string): FilterNode {
  if (!expression.trim()) return { type: 'and', children: [] };
  if (expression.length > 10000) throw new Error('Filter is too long.');
  const tokens: Token[] = [];
  let at = 0;
  while (at < expression.length) {
    const rest = expression.slice(at);
    const space = /^\s+/.exec(rest);
    if (space) {
      at += space[0].length;
      continue;
    }
    if (rest[0] === '"') {
      const match = /^"(?:[^"\\]|\\.)*"/.exec(rest);
      if (!match) throw new Error('Unclosed quoted value.');
      try {
        tokens.push({ text: JSON.parse(match[0]) as string, quoted: true });
      } catch {
        throw new Error('Invalid quoted value. Use JSON string escaping.');
      }
      at += match[0].length;
    } else {
      const match = /^(>=|<=|!=|=|>|<|\(|\)|[^\s()=<>!]+|!contains|!exists)/.exec(rest);
      if (!match) throw new Error('Unexpected character near: ' + rest.slice(0, 20));
      tokens.push({ text: match[0], quoted: false });
      at += match[0].length;
    }
  }
  let cursor = 0;
  const peek = (value: string) =>
    !tokens[cursor]?.quoted && tokens[cursor]?.text.toUpperCase() === value;
  const take = () => {
    const t = tokens[cursor++];
    if (!t) throw new Error('Filter expression is incomplete.');
    return t;
  };
  function primary(depth: number): FilterNode {
    if (depth > 20) throw new Error('Filter groups are nested too deeply.');
    if (peek('NOT')) {
      take();
      return { type: 'not', child: primary(depth + 1) };
    }
    if (peek('(')) {
      take();
      const child = or(depth + 1);
      if (!peek(')')) throw new Error('Missing closing parenthesis.');
      take();
      return child;
    }
    const field = take().text,
      op = take().text.toLowerCase();
    if (!operators.includes(op as Operator)) throw new Error('Unknown operator: ' + op);
    const value = op.includes('exists') ? '' : take().text;
    return { type: 'predicate', field, operator: op as Operator, value };
  }
  function and(depth: number): FilterNode {
    const children = [primary(depth)];
    while (peek('AND')) {
      take();
      children.push(primary(depth));
    }
    return children.length === 1 ? children[0]! : { type: 'and', children };
  }
  function or(depth: number): FilterNode {
    const children = [and(depth)];
    while (peek('OR')) {
      take();
      children.push(and(depth));
    }
    return children.length === 1 ? children[0]! : { type: 'or', children };
  }
  const node = or(0);
  if (cursor !== tokens.length) throw new Error('Expected AND or OR near: ' + tokens[cursor]!.text);
  compileFilter(node);
  return node;
}
export function printFilter(node: FilterNode): string {
  if (node.type === 'predicate')
    return (
      node.field +
      ' ' +
      node.operator +
      (node.operator.includes('exists') ? '' : ' ' + JSON.stringify(node.value))
    );
  if (node.type === 'not') return 'NOT (' + printFilter(node.child) + ')';
  return node.children
    .map((n) => '(' + printFilter(n) + ')')
    .join(' ' + node.type.toUpperCase() + ' ');
}
export const presets = [
  { name: 'Errors', expression: 'status >= 400' },
  { name: 'Slow APIs', expression: 'timing.total > 1000' },
  { name: 'Auth APIs', expression: 'url contains "auth"' },
  {
    name: 'API requests',
    expression: 'resourceType = Fetch OR resourceType = XHR OR resourceType = xmlhttprequest',
  },
  { name: 'GraphQL', expression: 'operationName exists OR url contains "graphql"' },
];
