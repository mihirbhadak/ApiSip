import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { FilterBuilder } from '../src/ui/components/FilterBuilder';

it('selects a resource suggestion and applies the visual filter with Enter', async () => {
  const user = userEvent.setup(),
    apply = vi.fn();
  render(
    <FilterBuilder
      expression={'resourceType = "XHR"'}
      onApply={apply}
      onSave={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  await user.click(screen.getByLabelText('Filter value'));
  await user.type(screen.getByLabelText('Filter value'), 'XMLHttpRequest');
  await user.keyboard('{Enter}');
  expect(apply).not.toHaveBeenCalled();
  await user.keyboard('{Enter}');
  expect(apply).toHaveBeenCalledWith(expect.stringContaining('XMLHttpRequest'));
});

it('applies a typed custom value without requiring selection and supports expression Enter', async () => {
  const user = userEvent.setup(),
    apply = vi.fn();
  render(
    <FilterBuilder
      expression={'domain = "example.com"'}
      onApply={apply}
      onSave={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  await user.click(screen.getByLabelText('Filter value'));
  await user.type(screen.getByLabelText('Filter value'), 'local.test');
  await user.click(screen.getByRole('button', { name: 'Apply filter' }));
  expect(apply).toHaveBeenLastCalledWith(expect.stringContaining('local.test'));
  await user.click(screen.getByRole('tab', { name: 'Expression' }));
  await user.clear(screen.getByLabelText('Filter expression'));
  await user.type(screen.getByLabelText('Filter expression'), 'status >= 400');
  apply.mockClear();
  await user.keyboard('{Shift>}{Enter}{/Shift}');
  expect(apply).not.toHaveBeenCalled();
  await user.keyboard('{Enter}');
  expect(apply).toHaveBeenCalledWith('status >= 400\n');
});
