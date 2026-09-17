import { useState } from 'react';
import { uid } from '../../shared/model';
import { environmentSchema, type Environment } from '../../lab/model';
import { Dialog } from '../components/Dialog';
import { PairEditor } from '../components/PairEditor';
export function EnvironmentDialog({
  initial,
  workspaceId,
  onSave,
  onClose,
}: {
  initial?: Environment;
  workspaceId: string;
  onSave: (environment: Environment) => Promise<void>;
  onClose: () => void;
}) {
  const [env, setEnv] = useState<Environment>(
    () =>
      initial ?? {
        id: uid(),
        workspaceId,
        name: 'Staging',
        origin: '',
        variables: [],
        revision: 0,
        updatedAt: Date.now(),
      },
  );
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Dialog title="Environment variables" onClose={onClose} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError('');
          const result = environmentSchema.safeParse(env);
          if (!result.success) {
            setError(result.error.issues[0]?.message ?? 'Check the environment fields.');
            return;
          }
          setBusy(true);
          void onSave(result.data)
            .catch((e: unknown) =>
              setError(e instanceof Error ? e.message : 'Could not save environment.'),
            )
            .finally(() => setBusy(false));
        }}
      >
        <p>
          Use a named set of values for local or staging tests. A blank origin preserves every
          step’s original destination.
        </p>
        <label>
          Environment name
          <input
            value={env.name}
            onChange={(e) => setEnv({ ...env, name: e.target.value })}
            maxLength={120}
            required
          />
        </label>
        <label>
          Override origin (optional)
          <input
            value={env.origin}
            placeholder="https://staging.example.com"
            onChange={(e) => setEnv({ ...env, origin: e.target.value })}
          />
        </label>
        <p className="small muted">
          Only the origin changes; paths and queries stay intact. Static credential headers must be
          excluded or replaced with environment placeholders before changing origin.
        </p>
        <PairEditor
          label="Environment values"
          pairs={env.variables.map((v) => ({ name: v.name, value: String(v.value ?? '') }))}
          keyPlaceholder="apiToken"
          valuePlaceholder="Use {{apiToken}} in a header"
          onChange={(variables) => setEnv({ ...env, variables })}
        />
        <p className="notice">
          Values entered here are text. They are stored locally, unencrypted, like editor drafts.
          Recognized secrets are masked on screen. Environments are not included in suite exports.
        </p>
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
            Save environment
          </button>
        </div>
      </form>
    </Dialog>
  );
}
