import { useEffect, useState } from 'react';

export default function DarkModeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('zc:dark');
      if (stored !== null) {
        const val = stored === '1';
        setIsDark(val);
  document.documentElement.classList.toggle('dark', val);
  if (typeof document !== 'undefined' && document.body) document.body.classList.toggle('dark', val);
      } else {
        // prefer system dark mode if no preference stored
        const prefers = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        setIsDark(prefers);
  document.documentElement.classList.toggle('dark', prefers);
  if (typeof document !== 'undefined' && document.body) document.body.classList.toggle('dark', prefers);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    try {
      localStorage.setItem('zc:dark', next ? '1' : '0');
    } catch (e) {}
  document.documentElement.classList.toggle('dark', next);
  if (typeof document !== 'undefined' && document.body) document.body.classList.toggle('dark', next);
  // helpful debug for users checking console
  try { console.debug('[DarkModeToggle] toggled dark:', next); } catch (e) {}
  };

  return (
    <div className="dark-toggle">
      <button
        aria-pressed={isDark}
        onClick={toggle}
        className="btn btn-ghost"
        title={isDark ? 'Switch to light' : 'Switch to dark'}
      >
    <span style={{display:'inline-block', lineHeight:1}}>{isDark ? '🌙' : '☀️'}</span>
    <span style={{position:'absolute', left: -9999, width:1, height:1, overflow:'hidden'}}>{isDark ? 'Dark mode on' : 'Dark mode off'}</span>
      </button>
    </div>
  );
}
