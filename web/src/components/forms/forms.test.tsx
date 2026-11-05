import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { FormField } from './FormField';
import { FormSelect } from './FormSelect';
import { Modal } from './Modal';
import { SearchInput } from './SearchInput';

describe('FormField', () => {
  test('associates label with input', () => {
    render(<FormField label="Email" />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  test('shows error and marks input invalid', () => {
    render(<FormField label="Email" error="Required" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('FormSelect', () => {
  test('renders placeholder and options', () => {
    render(
      <FormSelect label="Fund" placeholder="Choose" options={[{ value: 'a', label: 'Alpha' }]} />
    );
    expect(screen.getByRole('option', { name: 'Choose' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Alpha' })).toBeInTheDocument();
  });
});

describe('Modal', () => {
  test('renders nothing when closed', () => {
    render(
      <Modal open={false} title="T" onClose={() => {}}>
        body
      </Modal>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('closes on Escape and on close button', async () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Edit" onClose={onClose}>
        body
      </Modal>
    );
    expect(screen.getByRole('dialog', { name: 'Edit' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test('moves focus into the dialog and keeps keyboard focus inside it', async () => {
    render(
      <Modal open title="Create" onClose={() => {}} footer={<button type="button">Save</button>}>
        <label>
          Name
          <input />
        </label>
      </Modal>
    );

    expect(screen.getByLabelText('Name')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });
});

describe('SearchInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('debounces the search callback', () => {
    const onSearch = vi.fn();
    render(<SearchInput onSearch={onSearch} delayMs={300} />);
    onSearch.mockClear();
    const input = screen.getByRole('searchbox');
    act(() => {
      input.focus();
    });
    // user-event with fake timers is awkward; drive the value change directly.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'grace');
    act(() => {
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(onSearch).not.toHaveBeenCalledWith('grace');
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(onSearch).toHaveBeenCalledWith('grace');
  });
});
