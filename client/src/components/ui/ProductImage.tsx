import { imageSources } from '@/lib/imageSrc';
import { cn } from '@/lib/cn';

interface Props { src: string; alt: string; className?: string; eager?: boolean; sizes?: string; width?: number; height?: number; targetWidth?: number }

export function ProductImage({ src, alt, className, eager, sizes, width, height, targetWidth }: Props) {
  const s = imageSources(src, targetWidth);
  return (
    <picture className="block h-full w-full">
      {s.webp && <source srcSet={s.webp} type="image/webp" sizes={sizes ?? '(max-width: 640px) 92vw, 640px'} />}
      <img src={s.src} alt={alt} width={width} height={height} loading={eager ? 'eager' : 'lazy'} decoding="async" className={cn('h-full w-full object-cover', className)} />
    </picture>
  );
}
