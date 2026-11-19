import { contactEmail } from '@/lib/contact'

// Lê CONTACT_EMAIL em tempo de execução (ver lib/contact.ts).
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Como medimos — Rei do FPS',
  description:
    'Transparência de método: o que ainda é amostra (preços), o que estimamos (FPS), de onde vem cada número e o que não fazemos.',
}

export default function ComoMedimosPage() {
  const contact = contactEmail()
  return (
    <article className="max-w-3xl mx-auto space-y-10">
      <header className="text-center pb-6 border-b border-border">
        <h1
          className="text-4xl mb-3"
          style={{ fontFamily: 'var(--font-plex), "IBM Plex Sans", sans-serif' }}
        >
          Como medimos
        </h1>
        <p className="text-secondary text-lg">
          Transparência total — porque R$ por FPS sem método é chute.
        </p>
      </header>

      <section>
        <h2 className="text-2xl mb-3" style={{ fontFamily: 'var(--font-plex), "IBM Plex Sans", sans-serif' }}>
          1. Preços: o que é real hoje
        </h2>
        <p>
          <strong style={{ color: 'var(--text-mono)' }}>Ainda não temos preço de loja.</strong>{' '}
          Os valores que aparecem no site estão marcados como{' '}
          <span className="num-mono">amostra</span>: servem para mostrar o custo por FPS de
          cada build, não são oferta de venda.
        </p>
        <p className="mt-3">
          Os preços reais vão entrar pelos feeds oficiais dos programas de afiliado das
          lojas — sem raspar site de ninguém. Quando entrarem, cada oferta mostra quando foi
          verificada pela última vez: até 24h é fresca, de 24h a 72h ganha aviso, e passou
          de 72h sem confirmação ela some. Nada de preço fantasma.
        </p>
      </section>

      <section>
        <h2 className="text-2xl mb-3" style={{ fontFamily: 'var(--font-plex), "IBM Plex Sans", sans-serif' }}>
          2. O que estimamos
        </h2>
        <p>
          <strong style={{ color: 'var(--text-mono)' }}>FPS.</strong> Não temos
          bancada e não rodamos benchmark em casa. A fórmula é{' '}
          <span className="num-mono">anchor_scale</span>:
        </p>
        <p className="num-mono text-sm mt-2 mb-2">
          FPS ≈ o menor entre o limite da placa e o limite do processador
        </p>
        <ul className="list-disc pl-6 mt-2 space-y-1 text-secondary">
          <li>
            <strong>GPU:</strong> calibrada em ago/2026 contra o GPU Benchmarks Hierarchy 2026
            do Tom&apos;s Hardware — mesma bancada (Ryzen 7 9800X3D) para todas as placas,
            média de 11 jogos em 1080p Ultra.
          </li>
          <li>
            <strong>Jogo:</strong> 6 dos 13 jogos calibrados com medição real — 5 nos gráficos
            por jogo do mesmo Tom&apos;s Hardware e o Valorant no teste da ComputerBase já com a
            Unreal Engine 5 (16 placas, mesma bancada). Os outros 7 ainda usam um fator estimado,
            e isso vem marcado na fonte de cada número.
          </li>
          <li>
            <strong>CPU:</strong> 5 dos 7 processadores calibrados no CPU Benchmarks Hierarchy
            2026 do Tom&apos;s Hardware; os outros 2 por aproximação documentada.
          </li>
        </ul>
        <p className="mt-3">
          <strong>Custo por FPS:</strong> preço total ÷ FPS médio em Valorant, CS2, Fortnite e
          GTA V em 1080p. A média é <strong>geométrica</strong>: cada jogo pesa igual, mesmo os
          eSports que passam das centenas de FPS (é a mesma média que o Tom&apos;s Hardware usa).
        </p>
        <p className="mt-3">
          <strong>Gargalo:</strong> o limite da placa é o desempenho dela no jogo e na
          resolução escolhidos. O limite do processador é o FPS que ele entrega com a placa
          mais rápida do catálogo (é assim que a tabela de CPUs do Tom&apos;s Hardware mede).
          Numa placa de entrada quem limita é a placa — trocar o processador quase não muda o
          número; numa placa topo de linha, o processador passa a pesar.
        </p>
        <p className="mt-3">
          Cada número sai com <strong>banda de confiança</strong>: hoje entre{' '}
          <span className="num-mono">±16%</span> e <span className="num-mono">±22%</span> em
          1080p, mais larga em 1440p e 4K. Quanto mais calibrado o par CPU + GPU + jogo, mais
          estreita a banda. A borda de baixo foi conferida contra o &quot;1% Low&quot; real
          publicado pelo Tom&apos;s Hardware.
        </p>
      </section>

      <section>
        <h2 className="text-2xl mb-3" style={{ fontFamily: 'var(--font-plex), "IBM Plex Sans", sans-serif' }}>
          3. O que não fazemos
        </h2>
        <ul className="list-disc pl-6 space-y-1 text-secondary">
          <li>Não temos bancada de testes própria.</li>
          <li>Não usamos API paga de FPS de terceiros (ainda).</li>
          <li>Não inventamos número quando não há referência — a peça fica &quot;em análise&quot;.</li>
          <li>Não dizemos &quot;testamos&quot; quando na verdade estimamos.</li>
          <li>Não deixamos comissão de afiliado mexer no ranking.</li>
          <li>Anúncios e conteúdo patrocinado aparecem sempre marcados e nunca mudam o ranking nem a escolha do Rei.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl mb-3" style={{ fontFamily: 'var(--font-plex), "IBM Plex Sans", sans-serif' }}>
          4. Airflow
        </h2>
        <p>
          Modelo de zonas — o gabinete é dividido em zonas (entrada, GPU, CPU, saída) e o
          score <span className="num-mono">0–100</span> vem de fluxo de ar estimado, não
          medido. <span style={{ color: 'var(--accent-orange)' }}>apertado</span> e{' '}
          <span style={{ color: 'var(--accent-red)' }}>crítico</span> são sinais, não
          sentença: o gabinete pode ficar bem com ventoinhas extras.
        </p>
        <p className="mt-3">
          Quando a ficha de cada ventoinha existe, o fluxo é a soma delas, uma a uma. Entrar
          muito mais ar do que sai rende menos: acima de <span className="num-mono">3×</span> a
          saída, o ar a mais conta só metade, porque boa parte escapa pelas frestas sem passar
          pelas peças. É uma regra nossa, não uma medição.
        </p>
      </section>

      <section>
        <h2 className="text-2xl mb-3" style={{ fontFamily: 'var(--font-plex), "IBM Plex Sans", sans-serif' }}>
          5. Como o Rei de cada faixa é escolhido
        </h2>
        <p>
          Não é escolha à mão. Um programa testa <strong>todas</strong> as combinações de peças do
          catálogo e coroa, em cada faixa (até R$ 4,5k, até R$ 7k, até R$ 11k e R$ 11k+), a build com{' '}
          <strong>mais FPS médio em 1080p</strong> que caiba no teto. Para entrar ela tem de:
        </p>
        <ul className="list-disc pl-6 space-y-1 text-secondary mt-2">
          <li>passar em todas as checagens de compatibilidade da página, sem nenhum aviso;</li>
          <li>ter fluxo de ar de pelo menos <span className="num-mono">70</span> no mesmo modelo do visualizador;</li>
          <li>usar só processadores com FPS calibrado em fonte pública (sem palpite);</li>
          <li>em empate de FPS, ganha a mais barata.</li>
        </ul>
        <p className="mt-2">
          O cálculo roda de novo todos os dias com os preços do momento — se uma peça baixar, o Rei
          pode mudar. Se nenhuma build passar numa faixa, o Rei anterior fica. O custo por FPS
          continua a ser a régua que compara as faixas entre si.
        </p>
      </section>

      <footer className="pt-6 border-t border-border text-sm text-secondary">
        <p>
          A Harpia observa.{' '}
          {contact ? (
            <>
              Achou um número que parece errado?{' '}
              <a href={`mailto:${contact}`} style={{ color: 'var(--accent-gold)' }}>
                Avisa a gente
              </a>
              .
            </>
          ) : (
            <>Ainda em calibração — com tráfego real, a ideia é abrir envio de FPS medido por quem joga.</>
          )}
        </p>
      </footer>
    </article>
  )
}