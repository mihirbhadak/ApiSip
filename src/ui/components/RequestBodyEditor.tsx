import { useMemo, useState } from 'react';
import { LockKeyhole, UnlockKeyhole } from 'lucide-react';
import type { Body } from '../../shared/model';
import { makeBody, prettyJson } from '../../shared/parse';
import { MASK, redactBody, sensitiveName } from '../../shared/security';
import { bodyFields, bodyFieldEnabled, pathKey, pathWithin } from '../../shared/request-fields';
import { SendToggle } from './SendToggle';

export function RequestBodyEditor({
  body,
  contentType,
  onChange,
}: {
  body?: Body;
  contentType: string;
  onChange: (body?: Body) => void;
}) {
  const [reveal, setReveal] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const text = body?.text ?? '',
    masked = redactBody(text, body?.type);
  const protectedBody = !reveal && masked !== text;
  const excluded = body?.excludedPaths ?? [];
  const bodyOff = body?.enabled === false,
    hasExclusions = bodyOff || !!excluded.length;
  const inventory = useMemo(() => bodyFields(body), [body]);
  const editable = !protectedBody && !hasExclusions;
  return (
    <section aria-label="Request body editor">
      <div className="section-heading">
        <div className="body-send-heading">
          <SendToggle
            label="request body"
            included={!bodyOff}
            disabled={!body}
            onChange={(enabled) => body && onChange({ ...body, enabled })}
          />
          <strong>{bodyOff ? 'Body excluded from request' : 'Send request body'}</strong>
        </div>
        <button
          type="button"
          className="text-button"
          onClick={() => setReveal(!reveal)}
          title="Display masking does not change what is sent"
        >
          {reveal ? <LockKeyhole size={13} /> : <UnlockKeyhole size={13} />}{' '}
          {reveal ? 'Mask secrets' : 'Reveal secrets'}
        </button>
      </div>
      <p className="small muted">
        Close an eye to exclude a field. Its blurred value remains saved; open the eye to send it
        again.
      </p>
      {!!inventory.fields.length && (
        <details className="body-field-controls" open>
          <summary>Body fields · {inventory.fields.length} shown</summary>
          <div
            className="body-field-list"
            role="group"
            tabIndex={0}
            aria-label="Body field inclusion"
          >
            {inventory.fields.map((field) => {
              const included = bodyFieldEnabled(body!, field.path);
              const parentOff =
                bodyOff ||
                excluded.some(
                  (parent) => parent.length < field.path.length && pathWithin(field.path, parent),
                );
              const sensitive = field.path.some((part) => sensitiveName(String(part)));
              const value = field.container
                ? Array.isArray(field.value)
                  ? `[${field.value.length} items]`
                  : '{…}'
                : !reveal && sensitive
                  ? MASK
                  : reveal
                    ? JSON.stringify(field.value)
                    : redactBody(JSON.stringify(field.value), 'json');
              return (
                <div className="body-field-row" key={pathKey(field.path)}>
                  <SendToggle
                    label={'body field ' + field.label}
                    included={included}
                    disabled={parentOff}
                    onChange={(enabled) =>
                      onChange({
                        ...body!,
                        excludedPaths: enabled
                          ? excluded.filter((path) => pathKey(path) !== pathKey(field.path))
                          : [...excluded, field.path],
                      })
                    }
                  />
                  <code title={field.label}>{field.label}</code>
                  <input
                    aria-label={'Body field value ' + field.label}
                    className={!included ? 'excluded-value' : ''}
                    value={value}
                    readOnly
                    disabled={!included}
                    title={included ? undefined : 'Excluded from request'}
                  />
                </div>
              );
            })}
          </div>
        </details>
      )}
      {inventory.note && <p className="small muted">{inventory.note}</p>}
      {!inventory.fields.length && !inventory.note && body && (
        <p className="small muted">
          Individual eyes support JSON and URL-encoded form fields. Use the body eye for this
          format.
        </p>
      )}
      <div className="button-row">
        <button
          type="button"
          disabled={!editable}
          onClick={() => {
            try {
              onChange(makeBody(prettyJson(text), 'application/json'));
              setMessage('JSON formatted');
              setError('');
            } catch {
              setError('Body is not valid JSON.');
            }
          }}
        >
          Format JSON
        </button>
        <button
          type="button"
          onClick={() => {
            try {
              JSON.parse(text);
              setMessage('Valid JSON');
              setError('');
            } catch {
              setError('Body is not valid JSON.');
            }
          }}
        >
          Validate
        </button>
        <button
          type="button"
          onClick={() => {
            onChange(undefined);
            setMessage('Body removed');
          }}
        >
          Remove body
        </button>
      </div>
      {protectedBody && (
        <p className="small muted">
          Reveal secrets to edit this body. Masking only changes its display.
        </p>
      )}
      {hasExclusions && (
        <p className="small muted">
          Raw body is blurred and read-only while fields are excluded. Open their eyes to edit the
          original text.
        </p>
      )}
      <textarea
        aria-label="Request body"
        className={'body-editor ' + (hasExclusions ? 'excluded-value' : '')}
        readOnly={!editable}
        value={protectedBody ? masked : text}
        spellCheck={false}
        onChange={(event) =>
          onChange({
            ...makeBody(event.target.value, contentType),
            enabled: body?.enabled,
            excludedPaths: body?.excludedPaths,
          })
        }
      />
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="success-text">
          {message}
        </p>
      )}
    </section>
  );
}
