import { useEffect, useState } from 'react';

export function useCaptureShortcut() {
  const [shortcut, setShortcut] = useState('Alt + Shift + C');
  useEffect(() => {
    if (!globalThis.chrome?.commands?.getAll) return;
    let active = true;
    const refresh = () => {
      void chrome.commands
        .getAll()
        .then((commands) => {
          if (!active) return;
          const assigned = commands.find(
            (command) => command.name === 'toggle-recording',
          )?.shortcut;
          setShortcut(assigned ? assigned.replaceAll('+', ' + ') : 'Not assigned in Chrome');
        })
        .catch(() => {
          if (active) setShortcut('Check Chrome shortcuts');
        });
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return shortcut;
}
