import { Eye, EyeOff } from 'lucide-react';

export function SendToggle({
  label,
  included,
  disabled = false,
  onChange,
}: {
  label: string;
  included: boolean;
  disabled?: boolean;
  onChange: (included: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={'icon-button send-toggle ' + (included ? 'included' : 'excluded')}
      aria-label={'Send ' + label}
      aria-pressed={included}
      disabled={disabled}
      title={(included ? 'Exclude ' : 'Include ') + label + ' in the request'}
      onClick={() => onChange(!included)}
    >
      {included ? <Eye size={15} /> : <EyeOff size={15} />}
    </button>
  );
}
