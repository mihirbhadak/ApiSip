import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  baselineSchema,
  capturedBaseline,
  compareBaseline,
  createBaseline,
  jsonShape,
} from '../src/lab/baseline';
import { newSuite, type TestStep } from '../src/lab/model';
import { runSuite } from '../src/lab/engine';
import { exportSuite, importSuite } from '../src/lab/export';
import { makeBody } from '../src/shared/parse';
import { BaselineEditor } from '../src/ui/lab/BaselineEditor';
const response = (text: string) => ({
  status: 200,
  statusText: 'OK',
  headers: [],
  body: makeBody(text, 'application/json'),
});
describe('structural response baselines', () => {
  it('stores types and escaped paths without values, preserves falsy and hostile keys', () => {
    const baseline = createBaseline('{"a/b":{"~":[0,false,null,"private-value"]},"__proto__":{}}');
    expect(JSON.stringify(baseline)).not.toContain('private-value');
    expect(baseline.fields).toContainEqual({ path: '/a~1b/~0/3', type: 'string' });
    expect(baseline.fields).toContainEqual({ path: '/__proto__', type: 'object' });
    expect(
      compareBaseline(baseline, response('{"__proto__":{},"a/b":{"~":[12,true,null,"other"]}}'))
        .count,
    ).toBe(0);
  });
  it('reports additions, removals, type changes and exact array indices', () => {
    const baseline = createBaseline('{"user":{"id":1},"items":[false,null]}');
    const result = compareBaseline(
      baseline,
      response('{"user":{"id":"1"},"items":[false],"new":true}'),
    );
    expect(result.count).toBe(3);
    expect(result.changes).toEqual([
      'Changed /user/id: number → string',
      'Removed /items/1',
      'Added /new',
    ]);
  });
  it('ignores entire branches only at boundaries and can allow additional fields', () => {
    const baseline = {
      ...createBaseline('{"id":1,"identity":2,"debug":{"time":0}}'),
      ignoredPaths: ['/id', '/debug'],
      allowAdditional: true,
    };
    expect(compareBaseline(baseline, response('{"id":{},"identity":2,"extra":true}')).count).toBe(
      0,
    );
    expect(compareBaseline(baseline, response('{"identity":"wrong"}')).count).toBe(1);
    expect(baselineSchema.safeParse({ ...baseline, ignoredPaths: [''] }).success).toBe(false);
  });
  it('rejects incomplete samples, malformed imports and excessive work instead of passing', () => {
    expect(() =>
      capturedBaseline({
        ...response('{}'),
        body: { ...makeBody('{}', 'application/json'), truncated: true },
      }),
    ).toThrow('complete');
    expect(() => jsonShape('{')).toThrow('valid JSON');
    expect(() => jsonShape(JSON.stringify(Array(2001).fill(1)))).toThrow('2,000');
    expect(() => jsonShape('['.repeat(33) + '0' + ']'.repeat(33))).toThrow('32 levels');
    expect(() => jsonShape(JSON.stringify('x'.repeat(1_048_576)))).toThrow('1 MB');
    expect(() => jsonShape(JSON.stringify('漢'.repeat(400_000)))).toThrow('UTF-8');
    const baseline = createBaseline('{}');
    expect(
      baselineSchema.safeParse({ ...baseline, fields: [{ path: '/missing/id', type: 'number' }] })
        .success,
    ).toBe(false);
    expect(
      baselineSchema.safeParse({ ...baseline, fields: [...baseline.fields, ...baseline.fields] })
        .success,
    ).toBe(false);
    expect(baselineSchema.safeParse({ ...baseline, ignoredPaths: ['/bad~escape'] }).success).toBe(
      false,
    );
  });
  it('fails suites on contract changes, marks truncated JSON inconclusive and safely round-trips', async () => {
    const suite = newSuite('default');
    suite.steps[0]!.sourceId = 'private-capture-id';
    suite.steps[0]!.baseline = createBaseline('{"id":1}');
    const exported = exportSuite(suite);
    expect(JSON.parse(exported).schemaVersion).toBe(2);
    expect(exported).not.toContain('private-capture-id');
    const imported = importSuite(exported, 'new-workspace');
    expect(imported.steps[0]!.baseline).toEqual(suite.steps[0]!.baseline);
    const run = async (text: string, truncated = false) =>
      runSuite(
        imported,
        undefined,
        async () => ({
          response: {
            ...response(text),
            body: { ...makeBody(text, 'application/json'), truncated },
          },
          duration: 1,
        }),
        new AbortController().signal,
        async () => {},
      );
    expect((await run('{"id":2}')).state).toBe('passed');
    expect((await run('{"id":"secret-new-value"}')).steps[0]!.checks.at(-1)?.message).toContain(
      '/id',
    );
    expect(JSON.stringify(await run('{"id":"secret-new-value"}'))).not.toContain(
      'secret-new-value',
    );
    expect((await run('{}', true)).steps[0]!.checks.at(-1)?.state).toBe('inconclusive');
  });
});
it('previews, names, ignores and removes a baseline through accessible controls', async () => {
  const user = userEvent.setup();
  function Harness() {
    const [step, setStep] = useState<TestStep>(newSuite('default').steps[0]!);
    return <BaselineEditor step={step} onChange={setStep} />;
  }
  render(<Harness />);
  await user.click(screen.getByText(/Response baseline/));
  await user.click(screen.getByLabelText('Or paste a JSON sample'));
  await user.paste('{"id":1,"time":0}');
  await user.click(screen.getByRole('button', { name: 'Preview sample structure' }));
  await user.click(screen.getByLabelText('Or paste a JSON sample'));
  await user.paste('{');
  await user.click(screen.getByRole('button', { name: 'Preview sample structure' }));
  expect(screen.getByRole('alert')).toHaveTextContent('valid JSON');
  expect(screen.queryByRole('button', { name: 'Use this baseline' })).not.toBeInTheDocument();
  await user.clear(screen.getByLabelText('Or paste a JSON sample'));
  await user.click(screen.getByLabelText('Or paste a JSON sample'));
  await user.paste('{"id":1,"time":0}');
  await user.click(screen.getByRole('button', { name: 'Preview sample structure' }));
  await user.click(screen.getByRole('button', { name: 'Use this baseline' }));
  await user.clear(screen.getByLabelText('Baseline name'));
  await user.type(screen.getByLabelText('Baseline name'), 'User contract');
  await user.type(screen.getByLabelText('Ignored JSON paths (one per line)'), '/time \n');
  await user.tab();
  expect(screen.getByLabelText('Ignored JSON paths (one per line)')).toHaveValue('/time ');
  await user.click(screen.getByRole('button', { name: 'Remove baseline' }));
  expect(screen.getByRole('dialog')).toBeVisible();
});
