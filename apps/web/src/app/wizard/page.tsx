import WizardOrchestrator from '@/components/WizardOrchestrator'

export const metadata = {
  title: 'Wizard — Rei do FPS',
  description: 'Diz seu orçamento, os jogos que você joga e a prioridade. A Harpia decreta 3 builds.',
}

export default function WizardPage() {
  return (
    <div>
      <div className="text-center mb-10">
        <h1
          className="text-4xl mb-2"
          style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}
        >
          Monte seu build
        </h1>
        <p className="text-secondary">
          3 passos. Sem cadastro. Sem “IA escolhe por você”.
        </p>
      </div>

      <WizardOrchestrator />
    </div>
  )
}