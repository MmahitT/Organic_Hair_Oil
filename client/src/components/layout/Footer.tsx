import { Phone } from 'lucide-react';
import { useShop } from '@/hooks/useShop';
import { Link } from 'react-router-dom';
import { useOrdersT, useT } from '@/hooks/useT';
import { consentCopy } from '@/content/copyConsent';
import { useConsent } from '@/store/consent';
import { useHasTrackers } from './CookieBanner';
import { Logo } from './Logo';

export function Footer() {
  const { t, money } = useT();
  const { zones, phone, businessName, featured, wa, settings } = useShop();
  const whatsapp = settings?.business.whatsapp;
  const trackLabel = useOrdersT().track.footerLink;
  const contactLabel = useOrdersT().contact.footerLink;
  const { lang } = useT();
  const trackers = useHasTrackers();
  const openPanel = useConsent((s) => s.openPanel);
  const legalLinks: [string, string][] = lang === 'bn'
    ? [['/privacy', 'প্রাইভেসি পলিসি'], ['/terms', 'শর্তাবলী'], ['/returns', 'রিটার্ন ও রিফান্ড'], ['/shipping', 'শিপিং ও ডেলিভারি']]
    : [['/privacy', 'Privacy Policy'], ['/terms', 'Terms & Conditions'], ['/returns', 'Returns & Refunds'], ['/shipping', 'Shipping & Delivery']];
  const social = Object.entries(settings?.business.social ?? {}).filter(([, v]) => v);
  const links = [
    ...(featured ? ([['#offer', t.nav.offer]] as const) : []), ['#benefits', t.nav.benefits], ['#how-to-use', t.nav.howTo], ['#faq', t.nav.faq],
  ] as const;
  return (
    <footer className="bg-forest pb-24 text-sage-light lg:pb-0">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <Logo light />
          <p className="mt-4 max-w-xs text-sm">{t.footer.about}</p>
        </div>
        <div>
          <h3 className="mb-3 text-base !text-cream">{t.footer.links}</h3>
          <ul className="space-y-1">
            {links.map(([href, label]) => (
              <li key={href}><a href={href} className="flex min-h-9 items-center text-sm hover:text-white">{label}</a></li>
            ))}
            <li><Link to="/track" className="flex min-h-9 items-center text-sm hover:text-white">{trackLabel}</Link></li>
            <li><Link to="/contact" className="flex min-h-9 items-center text-sm hover:text-white">{contactLabel}</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 text-base !text-cream">{t.footer.contact}</h3>
          <ul className="space-y-1 text-sm">
            {phone && whatsapp && <li><a href={`tel:+${whatsapp}`} className="flex min-h-9 items-center gap-2 hover:text-white"><Phone aria-hidden className="h-4 w-4" />{phone}</a></li>}
            {settings?.business.email && <li><a href={`mailto:${settings.business.email}`} className="flex min-h-9 items-center hover:text-white">{settings.business.email}</a></li>}
            {settings?.business.address && <li className="py-1">{settings.business.address}</li>}
            {whatsapp && <li><a href={wa(t.wa.greeting)} target="_blank" rel="noopener noreferrer" className="flex min-h-9 items-center hover:text-white">{t.footer.whatsapp}</a></li>}
          </ul>
        </div>
        <div>
          <h3 className="mb-3 text-base !text-cream">{t.footer.deliveryInfo}</h3>
          <ul className="space-y-1 text-sm">
            {zones.map((z) => <li key={z.key}>{z.name}: {money(z.fee)}</li>)}
            {featured?.freeDelivery && <li className="text-gold-soft">{t.offers.comboFree}</li>}
          </ul>
        </div>
      </div>
      <div className="border-t border-forest-600">
        <div className="container-page flex flex-wrap items-center justify-between gap-3 py-4 text-xs">
          <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Legal">
            {legalLinks.map(([to, label]) => <li key={to}><Link to={to} className="hover:text-white">{label}</Link></li>)}
            {trackers.any && <li><button type="button" onClick={openPanel} className="hover:text-white">{consentCopy[lang].settings}</button></li>}
          </ul>
          <p className="basis-full sm:basis-auto">© {new Date().getFullYear()} {businessName}. {t.footer.rights}</p>
          {social.length > 0 && <ul className="flex gap-4">{social.map(([k, v]) => <li key={k}><a href={v} target="_blank" rel="noopener noreferrer" className="capitalize hover:text-white">{k}</a></li>)}</ul>}
        </div>
      </div>
    </footer>
  );
}
