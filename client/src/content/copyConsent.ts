import type { Lang } from './copy';

export interface ConsentCopy {
  title: string; text: string; acceptAll: string; reject: string; customise: string; save: string; close: string;
  analytics: string; analyticsText: string; marketing: string; marketingText: string; necessary: string; necessaryText: string;
  privacy: string; settings: string;
}

export const consentCopy: Record<Lang, ConsentCopy> = {
  en: {
    title: 'Cookies and tracking', text: 'We use optional tools to count visits and measure our adverts. They only run if you accept. The shop works the same if you decline.',
    acceptAll: 'Accept all', reject: 'Reject all', customise: 'Choose', save: 'Save my choices', close: 'Close',
    analytics: 'Analytics (Google Analytics)', analyticsText: 'Counts visits and which pages people use, so we can improve the website.',
    marketing: 'Advertising (Meta Pixel)', marketingText: 'Helps us measure our Facebook and Instagram adverts.',
    necessary: 'Necessary', necessaryText: 'Your cart and language choice are saved on your device so the shop works. Always on.',
    privacy: 'Privacy policy', settings: 'Cookie settings',
  },
  bn: {
    title: 'কুকি ও ট্র্যাকিং', text: 'ভিজিট গণনা ও বিজ্ঞাপনের ফল মাপতে আমরা কিছু ঐচ্ছিক টুল ব্যবহার করি। আপনি অনুমতি দিলে তবেই এগুলো চলবে। অনুমতি না দিলেও দোকান একইভাবে কাজ করবে।',
    acceptAll: 'সব গ্রহণ করুন', reject: 'সব বাতিল করুন', customise: 'বেছে নিন', save: 'আমার পছন্দ সেভ করুন', close: 'বন্ধ করুন',
    analytics: 'অ্যানালিটিক্স (Google Analytics)', analyticsText: 'কতজন ভিজিট করছেন ও কোন পেজ দেখছেন তা গুনে ওয়েবসাইট উন্নত করতে সাহায্য করে।',
    marketing: 'বিজ্ঞাপন (Meta Pixel)', marketingText: 'আমাদের ফেসবুক ও ইনস্টাগ্রাম বিজ্ঞাপনের ফল মাপতে সাহায্য করে।',
    necessary: 'প্রয়োজনীয়', necessaryText: 'দোকান চালু রাখতে আপনার কার্ট ও ভাষার পছন্দ আপনার ডিভাইসে সংরক্ষিত থাকে। সবসময় চালু।',
    privacy: 'প্রাইভেসি পলিসি', settings: 'কুকি সেটিংস',
  },
};
