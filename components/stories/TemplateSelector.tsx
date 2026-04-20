'use client';

export type StoryTemplateId = 'A' | 'B' | 'C' | 'D';

export interface StoryTemplate {
  id: StoryTemplateId;
  emoji: string;
  name: string;
  description: string;
  slideLabels: string[];
}

export const STORY_TEMPLATES: StoryTemplate[] = [
  {
    id: 'A',
    emoji: '📖',
    name: 'Освітній / Розповідь',
    description: 'Інсайт або досвід. Інтрига → Контекст → Пояснення → CTA',
    slideLabels: ['Інтрига (відео)', 'Стікер-взаємодія', 'Контекст', 'Пояснення', 'Що з цим робити', 'CTA в директ'],
  },
  {
    id: 'B',
    emoji: '💰',
    name: 'Продаж / Позиціювання',
    description: 'Продукт або послуга. Біль → Контекст → Мрія → CTA',
    slideLabels: ['Біль (відео)', 'Стікер "впізнаєш себе?"', 'Контекст / Експертиза', 'Мрія', 'CTA → директ'],
  },
  {
    id: 'C',
    emoji: '🔥',
    name: 'Провокація / Думка',
    description: 'Суперечлива позиція. Провокація → Аргумент → Питання',
    slideLabels: ['Провокація (відео)', 'Стікер "згоден/ні?"', 'Чому всі помиляються', 'Моя позиція', 'Питання до аудиторії'],
  },
  {
    id: 'D',
    emoji: '🎬',
    name: 'Закулісся / Особисте',
    description: 'Особистий момент або процес. Момент → Рефлексія → CTA',
    slideLabels: ['Особистий момент (відео)', 'Стікер "хочеш знати більше?"', 'Що відбувалось', 'Що я зрозумів', 'CTA в директ'],
  },
];

interface TemplateSelectorProps {
  selectedTemplate: StoryTemplateId | null;
  onSelect: (templateId: StoryTemplateId) => void;
}

export default function TemplateSelector({ selectedTemplate, onSelect }: TemplateSelectorProps) {
  return (
    <section className="space-y-3">
      <p className="text-sm font-medium text-zinc-700">Обери шаблон (опційно)</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {STORY_TEMPLATES.map((template) => {
          const isActive = selectedTemplate === template.id;
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelect(template.id)}
              className={[
                'rounded-2xl border p-4 text-left transition',
                isActive
                  ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)]'
                  : 'border-[color:var(--border)] bg-white hover:border-[color:var(--accent)]/40',
              ].join(' ')}
            >
              <p className="text-sm font-semibold text-zinc-900">
                {template.emoji} Шаблон {template.id} — {template.name}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600">{template.description}</p>
              <p className="mt-2 text-xs text-zinc-500">{template.slideLabels.join(' · ')}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
