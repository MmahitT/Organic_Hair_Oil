import type { Lang } from './copy';

export interface PayCopy {
  manualTitle: Record<'bkash' | 'nagad' | 'rocket', string>; bankTitle: string; bankText: string; howToPay: string; bankName: string; accountName: string; accountNumber: string; branch: string; afterOrder: string; manualText: string; noMethods: string;
  names: Record<string, string>;
  panel: {
    refundedTitle: string; refundedText: string; refundDue: string; partRefunded: string;
    paidTitle: string; paidText: string; released: string;
    bankHead: string; bankSend: string; referenceLabel: string; referenceHint: string; senderNameLabel: string; senderNameHint: string; ownerNote: string;
    manualHead: string; manualSend: string; manualNumber: string; trxLabel: string; trxHint: string; senderLabel: string; senderHint: string; submit: string; submitting: string; submitted: string; rejected: string; dupTrx: string; trxInvalid: string; senderInvalid: string; genericErr: string; copyNumber: string;
  };
}

export const payCopy: Record<Lang, PayCopy> = {
  en: {
    manualTitle: { bkash: 'bKash — send money', nagad: 'Nagad — send money', rocket: 'Rocket — send money' },
    manualText: 'Send the amount to our number, then enter the transaction ID on the next page. We verify it before dispatch.',
    bankTitle: 'Bank transfer', bankText: 'Transfer the amount to our bank account, then enter the transaction/reference number on the next page. We verify it in our bank statement before dispatch.', howToPay: 'How to pay', bankName: 'Bank', accountName: 'Account name', accountNumber: 'Account number', branch: 'Branch', afterOrder: 'After you place the order, you will enter your transaction ID. Your order is confirmed only after we verify the payment.',
    noMethods: 'No payment method is available right now. Please contact us on WhatsApp.',
    names: { cod: 'Cash on Delivery', manual_bkash: 'bKash (send money)', manual_nagad: 'Nagad (send money)', manual_rocket: 'Rocket (send money)', manual_bank: 'Bank transfer' },
    panel: {
      refundedTitle: 'Payment refunded', refundedText: 'We have refunded this payment. It may take a little time to show in your account.', refundDue: 'Your order was stopped and your refund is being processed.', partRefunded: 'Part of this payment was refunded.',
      paidTitle: 'Payment received', paidText: 'Thank you! Your payment was confirmed.',
      released: 'The payment time ended, so this order was released. Please place a new order.',
      bankHead: 'Transfer your payment', bankSend: 'Transfer exactly {amount} to this bank account, then enter the transaction / reference number from your receipt below.', referenceLabel: 'Payment reference (optional)', referenceHint: 'Anything that helps us find it, e.g. the bank or the time you paid', senderNameLabel: 'Name on the sending account (optional)', senderNameHint: 'As shown in your bank receipt', ownerNote: 'Your order is only marked paid after we check the money in our account. A screenshot or transaction ID alone does not confirm it.',
      manualHead: 'Send your payment', manualSend: 'Send exactly {amount} to this {channel} number, then enter the transaction ID (TrxID) below.', manualNumber: 'Send to',
      trxLabel: 'Transaction ID (TrxID)', trxHint: 'From the confirmation message you received, e.g. 8N7A6D5E4C', senderLabel: 'Number you sent from', senderHint: 'Your {channel} mobile number', submit: 'Submit payment details', submitting: 'Submitting…',
      submitted: 'Thank you! We received your payment details. Your order stays pending until we verify the payment.', rejected: 'We could not verify that payment. Please check the transaction ID and submit again.',
      dupTrx: 'This transaction ID was already submitted. Please check it and try again.', trxInvalid: 'Enter the transaction ID exactly as in your message (letters and numbers only).', senderInvalid: 'Enter a valid Bangladeshi mobile number.', genericErr: 'Something went wrong. Please try again.', copyNumber: 'Copy number',
    },
  },
  bn: {
    manualTitle: { bkash: 'বিকাশ — সেন্ড মানি', nagad: 'নগদ — সেন্ড মানি', rocket: 'রকেট — সেন্ড মানি' },
    manualText: 'আমাদের নম্বরে টাকা পাঠান, তারপর পরের পেজে ট্রানজেকশন আইডি দিন। পাঠানোর আগে আমরা যাচাই করব।',
    bankTitle: 'ব্যাংক ট্রান্সফার', bankText: 'আমাদের ব্যাংক অ্যাকাউন্টে টাকা পাঠান, তারপর পরের পেজে ট্রানজেকশন/রেফারেন্স নম্বর দিন। পাঠানোর আগে ব্যাংক স্টেটমেন্টে আমরা যাচাই করব।', howToPay: 'কীভাবে পেমেন্ট করবেন', bankName: 'ব্যাংক', accountName: 'অ্যাকাউন্টের নাম', accountNumber: 'অ্যাকাউন্ট নম্বর', branch: 'শাখা', afterOrder: 'অর্ডার করার পর আপনি ট্রানজেকশন আইডি দেবেন। পেমেন্ট যাচাই না হওয়া পর্যন্ত অর্ডার নিশ্চিত হবে না।',
    noMethods: 'এই মুহূর্তে কোনো পেমেন্ট পদ্ধতি চালু নেই। অনুগ্রহ করে হোয়াটসঅ্যাপে যোগাযোগ করুন।',
    names: { cod: 'ক্যাশ অন ডেলিভারি', manual_bkash: 'বিকাশ (সেন্ড মানি)', manual_nagad: 'নগদ (সেন্ড মানি)', manual_rocket: 'রকেট (সেন্ড মানি)', manual_bank: 'ব্যাংক ট্রান্সফার' },
    panel: {
      refundedTitle: 'পেমেন্ট ফেরত দেওয়া হয়েছে', refundedText: 'আমরা এই পেমেন্ট ফেরত দিয়েছি। আপনার অ্যাকাউন্টে দেখাতে কিছুটা সময় লাগতে পারে।', refundDue: 'আপনার অর্ডার বন্ধ করা হয়েছে এবং রিফান্ড প্রক্রিয়াধীন।', partRefunded: 'এই পেমেন্টের একটি অংশ ফেরত দেওয়া হয়েছে।',
      paidTitle: 'পেমেন্ট পাওয়া গেছে', paidText: 'ধন্যবাদ! আপনার পেমেন্ট নিশ্চিত হয়েছে।',
      released: 'পেমেন্টের সময় শেষ হয়ে যাওয়ায় অর্ডারটি ছেড়ে দেওয়া হয়েছে। অনুগ্রহ করে নতুন অর্ডার করুন।',
      bankHead: 'আপনার পেমেন্ট ট্রান্সফার করুন', bankSend: 'এই ব্যাংক অ্যাকাউন্টে ঠিক {amount} ট্রান্সফার করুন, তারপর রশিদের ট্রানজেকশন/রেফারেন্স নম্বর নিচে দিন।', referenceLabel: 'পেমেন্টের রেফারেন্স (ঐচ্ছিক)', referenceHint: 'খুঁজে পেতে সাহায্য করে এমন কিছু, যেমন ব্যাংকের নাম বা সময়', senderNameLabel: 'প্রেরকের অ্যাকাউন্টের নাম (ঐচ্ছিক)', senderNameHint: 'ব্যাংক রশিদে যেমন আছে', ownerNote: 'আমাদের অ্যাকাউন্টে টাকা দেখার পরেই আপনার অর্ডার পরিশোধিত হিসেবে চিহ্নিত হবে। শুধু স্ক্রিনশট বা ট্রানজেকশন আইডি দিয়ে নিশ্চিত হয় না।',
      manualHead: 'আপনার পেমেন্ট পাঠান', manualSend: 'এই {channel} নম্বরে ঠিক {amount} পাঠান, তারপর নিচে ট্রানজেকশন আইডি (TrxID) দিন।', manualNumber: 'যে নম্বরে পাঠাবেন',
      trxLabel: 'ট্রানজেকশন আইডি (TrxID)', trxHint: 'আপনার পাওয়া কনফার্মেশন মেসেজ থেকে, যেমন 8N7A6D5E4C', senderLabel: 'যে নম্বর থেকে পাঠিয়েছেন', senderHint: 'আপনার {channel} মোবাইল নম্বর', submit: 'পেমেন্টের তথ্য জমা দিন', submitting: 'জমা দেওয়া হচ্ছে…',
      submitted: 'ধন্যবাদ! আপনার পেমেন্টের তথ্য পেয়েছি। যাচাই না হওয়া পর্যন্ত অর্ডারটি অপেক্ষমাণ থাকবে।', rejected: 'এই পেমেন্টটি যাচাই করা যায়নি। ট্রানজেকশন আইডি মিলিয়ে আবার জমা দিন।',
      dupTrx: 'এই ট্রানজেকশন আইডি আগেই জমা দেওয়া হয়েছে। মিলিয়ে আবার চেষ্টা করুন।', trxInvalid: 'মেসেজে যেভাবে আছে সেভাবেই ট্রানজেকশন আইডি দিন (শুধু অক্ষর ও সংখ্যা)।', senderInvalid: 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন।', genericErr: 'কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।', copyNumber: 'নম্বর কপি করুন',
    },
  },
};
