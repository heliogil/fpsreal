'use client'

import { useEffect, useState } from 'react'

/** Light/dark toggle — flips data-theme on <html> and persists it. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const saved = (localStorage.getItem('rdf-theme') as 'dark' | 'light') || 'dark'
    setTheme(saved)
    document.documentElement.dataset.theme = saved
  }, [])

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next
    localStorage.setItem('rdf-theme', next)
  }

  return (
    <button
      onClick={toggle}
      className="btn seg"
      aria-label="Alternar tema claro/escuro"
      style={{
        background: 'var(--panel2)',
        border: '1px solid var(--line)',
        color: 'var(--text)',
        width: 34,
        height: 34,
        borderRadius: 8,
        fontSize: 15,
        lineHeight: 1,
      }}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  )
}
