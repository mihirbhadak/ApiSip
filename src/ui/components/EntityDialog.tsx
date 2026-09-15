import { useState } from 'react';
import { Dialog } from './Dialog';
export function EntityDialog({
  title,
  initial = '',
  onSave,
  onClose,
}: {
  title: string;
  initial?: string;
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Dialog title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setBusy(true);
          void onSave(name.trim())
            .then(onClose)
            .catch((error: unknown) =>
              setError(error instanceof Error ? error.message : 'Could not save.'),
            )
            .finally(() => setBusy(false));
        }}
      >
        <label className="field">
          Name
          <input
            autoFocus
            aria-label="Name"
            maxLength={120}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
}
