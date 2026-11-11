import { useT } from '@/hooks/useT';
import { cn } from '@/lib/cn';
import { useLangStore } from '@/store/lang';

export function LangToggle({ light }: { light?: boolean }) {
  const { t, lang } = useT();
  const setLang = useLangStore((s) => s.setLang);
  return (
    <div role="group" aria-label={t.a11y.language} className={cn('inline-flex rounded-full border p-0.5 text-xs font-semibold', light ? 'border-sage' : 'border-forest/30')}>
      {(['bn', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={cn('min-h-8 rounded-full px-3 transition-colors', lang === l ? 'bg-forest text-white' : light ? 'text-cream' : 'text-forest')}
        >
          {l === 'bn' ? 'বাংলা' : 'EN'}
        </button>
      ))}
    </div>
  );
}
