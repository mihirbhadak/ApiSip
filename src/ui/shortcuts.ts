export type ShortcutAction =
  | 'search'
  | 'commands'
  | 'export'
  | 'copy'
  | 'capture'
  | 'session'
  | 'workspace'
  | 'collection'
  | 'filters'
  | 'settings'
  | 'help'
  | 'list';
export const shortcuts: {
  action: ShortcutAction;
  key: string;
  modifier: 'primary' | 'alt';
  shift?: boolean;
  label: string;
  keys: string;
}[] = [
  {
    action: 'search',
    key: 'k',
    modifier: 'primary',
    label: 'Search requests',
    keys: 'Ctrl / Cmd + K',
  },
  {
    action: 'search',
    key: 'f',
    modifier: 'primary',
    label: 'Search requests',
    keys: 'Ctrl / Cmd + F',
  },
  {
    action: 'commands',
    key: 'p',
    modifier: 'primary',
    shift: true,
    label: 'Command palette',
    keys: 'Ctrl / Cmd + Shift + P',
  },
  {
    action: 'export',
    key: 'e',
    modifier: 'primary',
    label: 'Export requests',
    keys: 'Ctrl / Cmd + E',
  },
  {
    action: 'copy',
    key: 'c',
    modifier: 'primary',
    shift: true,
    label: 'Copy selected request as cURL',
    keys: 'Ctrl / Cmd + Shift + C',
  },
  {
    action: 'capture',
    key: 'c',
    modifier: 'alt',
    shift: true,
    label: 'Start / pause capture',
    keys: 'Alt + Shift + C',
  },
  {
    action: 'session',
    key: 'n',
    modifier: 'alt',
    shift: true,
    label: 'New session',
    keys: 'Alt + Shift + N',
  },
  {
    action: 'workspace',
    key: 'w',
    modifier: 'alt',
    shift: true,
    label: 'New workspace',
    keys: 'Alt + Shift + W',
  },
  {
    action: 'collection',
    key: 'l',
    modifier: 'alt',
    shift: true,
    label: 'New collection',
    keys: 'Alt + Shift + L',
  },
  {
    action: 'filters',
    key: 'f',
    modifier: 'alt',
    shift: true,
    label: 'Open filters',
    keys: 'Alt + Shift + F',
  },
  {
    action: 'settings',
    key: 's',
    modifier: 'alt',
    shift: true,
    label: 'Open settings',
    keys: 'Alt + Shift + S',
  },
  {
    action: 'help',
    key: 'h',
    modifier: 'alt',
    shift: true,
    label: 'Help and creator',
    keys: 'Alt + Shift + H',
  },
  {
    action: 'list',
    key: 'r',
    modifier: 'alt',
    shift: true,
    label: 'Focus request list',
    keys: 'Alt + Shift + R',
  },
];
export const localShortcuts = [
  { keys: 'Ctrl / Cmd + Enter', label: 'Send request (in the editor)' },
  { keys: 'Ctrl / Cmd + A', label: 'Select all matching requests (in the list)' },
  { keys: 'Space', label: 'Toggle focused request selection (in the list)' },
  { keys: 'Up / Down, Home / End', label: 'Navigate requests or menus' },
  { keys: 'Shift + F10', label: 'Open focused request menu' },
  { keys: 'Left / Right, Home / End', label: 'Navigate section tabs' },
  { keys: 'Type, Up / Down, Enter', label: 'Search a dropdown and choose an option' },
  { keys: 'Delete', label: 'Delete selection with confirmation (outside text fields)' },
  { keys: '?', label: 'Open help (outside text fields)' },
  { keys: 'Esc', label: 'Close the active menu, dropdown, dialog or details' },
];
