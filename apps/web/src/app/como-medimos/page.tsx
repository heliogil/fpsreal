export const metadata = {
  title: 'Como medimos — Rei do FPS',
  description:
    'Transparência de método: o que medimos de verdade (preços), o que estimamos (FPS), o que não fazemos (não temos bancada).',
}

export default function ComoMedimosPage() {
  return (
    <article className="max-w-3xl mx-auto space-y-10">
      <header className="text-center pb-6 border-b border-border">
        <h1
          className="text-4xl mb-3"
          style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}
        >
          Como medimos
        </h1>
        <p className="text-secondary text-lg">
          Transparência total — porque R$ por FPS sem método é chute.
        </p>
      </header>

      <section>
        <h2 className="text-2xl mb-3" style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}>
          1. O que medimos de verdade
        </h2>
        <p>
          <strong style={{ color: 'var(--text-mono)' }}>Preços.</strong> Vem das
          lojas parceiras (KaBuM, Pichau, Terabyte) via feeds atualizados a cada
          poucas horas. É o preço real que você paga hoje — não é MSRP, não é
          “preço de Black Friday passada”.
        </p>
      </section>

      <section>
        <h2 className="text-2xl mb-3" style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}>
          2. O que estimamos
        </h2>
        <p>
          <strong style={{ color: 'var(--text-mono)' }}>FPS.</strong> Não temos
          bancada. Não rodamos benchmarks em casa. O que fazemos é cruzar:
        </p>
        <ul className="list-disc pl-6 mt-2 space-y-1 text-secondary">
          <li>TechPowerUp (relative performance por SKU)</li>
          <li>PassMark (CPU mark / 3D mark)</li>
          <li>Cinebench R23 (apenas como âncora secundária)</li>
          <li>Reviews publicadas em sites com metodologia conhecida</li>
        </ul>
        <p className="mt-3">
          Modelo: <span className="num-mono">anchor_scale</span>. A banda padrão
          é de <span className="num-mono">±15%</span> — para combinações com
          menos dados públicos, chega a <span className="num-mono">±18%</span>.
        </p>
      </section>

      <section>
        <h2 className="text-2xl mb-3" style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}>
          3. O que não fazemos
        </h2>
        <ul className="list-disc pl-6 space-y-1 text-secondary">
          <li>Não temos bancada de testes própria.</li>
          <li>Não usamos API de terceiros paga para FPS (ainda).</li>
          <li>Não inventamos números quando não temos referência.</li>
          <li>Não dizemos “testamos” quando na verdade estimamos.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl mb-3" style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}>
          4. Crowdsourcing — calibre nosso modelo
        </h2>
        <p>
          Você tem o build e mediu FPS real no seu jogo?{' '}
          <a href="/wizard" style={{ color: 'var(--accent-gold)' }}>
            Mande pelo wizard
          </a>
          . Cada submissão ajusta a média e reduz a banda de confiança do par
          CPU+GPU+game.
        </p>
        <p className="mt-3 text-secondary text-sm">
          Por enquanto a coleta é manual (você cola o FPS medido). Quando
          tivermos volume, abrimos um endpoint público.
        </p>
      </section>

      <section>
        <h2 className="text-2xl mb-3" style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}>
          5. Airflow
        </h2>
        <p>
          Modelo de zonas v1 — case dividido em 4 zonas (intake front, gpu,
          cpu, exhaust rear). Score <span className="num-mono">0–100</span>{' '}
          baseado em fluxo de ar estimado (não medido).{' '}
          <span style={{ color: 'var(--accent-orange)' }}>tight</span> e{' '}
          <span style={{ color: 'var(--accent-red)' }}>critical</span> são
          sinalizações, não sentença: o case pode estar bem com fans adicionais.
        </p>
      </section>

      <footer className="pt-6 border-t border-border text-sm text-secondary">
        <p>
          A Harpia observa. Se encontrar um número que parece errado,{' '}
          <a href="mailto:harpia@reidofps.com.br" style={{ color: 'var(--accent-gold)' }}>
            avisa a gente
          </a>
          .
        </p>
      </footer>
    </article>
  )
}