/** Skeleton shown while the wizard computes builds (SSR). */
export default function Loading() {
  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-4xl mb-2" style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}>
          A Harpia observa…
        </h1>
        <p className="text-secondary">Cruzando preços com o banco de FPS.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card" aria-hidden="true">
            <div className="skeleton-line" style={{ width: '40%', height: 14, marginBottom: 16 }} />
            <div className="skeleton-line" style={{ width: '80%', height: 22, marginBottom: 8 }} />
            <div className="skeleton-line" style={{ width: '60%', height: 14, marginBottom: 20 }} />
            <div className="skeleton-line" style={{ width: '50%', height: 30, marginBottom: 16 }} />
            <div className="skeleton-line" style={{ width: '100%', height: 38 }} />
          </div>
        ))}
      </div>
    </div>
  )
}
