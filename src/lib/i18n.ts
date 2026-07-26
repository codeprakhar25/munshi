import type { AppLanguage } from '@/store/onboarding-store';

interface Strings {
  splashEyebrow: string;
  splashSub: string;
  start: string;
  notifTitle: string;
  notifBody: string;
  contactsTitle: string;
  contactsBody: string;
  allow: string;
  notNow: string;
  continueLabel: string;
  useDemo: string;
  chooseContacts: string;
  contactsImportTitle: string;
  contactsImportBody: (count: number) => string;
  contactsImportEmpty: string;
  mapTitle: string;
  mapHint: string;
  mapAliasPh: string;
  mapDone: string;
  mapSkip: string;
  firstScanTitle: string;
  firstScanBody: string;
  scanNow: string;
  skip: string;
  homeKicker: string;
  homeHero: string;
  pendingTotal: string;
  pendingList: string;
  pendingEmpty: string;
  scanPill: string;
  talkMunshi: string;
  entriesN: (n: number) => string;
  scanTitle: string;
  scanCamera: string;
  scanGallery: string;
  scanPdf: string;
  scanFrame: string;
  processingUploading: string;
  processingProcessing: string;
  processingParsing: string;
  reviewTitle: string;
  reviewEmpty: string;
  confirmLine: string;
  discardLine: string;
  saveConfirmed: (n: number) => string;
  selectPerson: string;
  whoIsThis: string;
  fromContacts: string;
  walkIn: string;
  searchContacts: string;
  credit: string;
  afterBal: string;
  toastScanSaved: (n: number) => string;
}

const en: Strings = {
  splashEyebrow: 'For your shop',
  splashSub: 'Your bahi, spoken into a clean khata.',
  start: 'Begin',
  notifTitle: 'Gentle reminders',
  notifBody: 'Ask when a khata needs a nudge — never spam, always your call.',
  contactsTitle: 'Know your people',
  contactsBody: 'We match names from your register to contacts — kept on this phone only.',
  allow: 'Allow',
  notNow: 'Not now',
  continueLabel: 'Continue',
  useDemo: 'Use sample list',
  chooseContacts: 'Choose contacts',
  contactsImportTitle: 'Contacts ready',
  contactsImportBody: (count) => `${count} contacts ready to map.`,
  contactsImportEmpty: 'No contacts — use sample list or add later.',
  mapTitle: 'Name the bahi',
  mapHint: 'Write how each person appears in your register.',
  mapAliasPh: 'e.g. Rajesh',
  mapDone: 'Save & continue',
  mapSkip: 'Skip for now',
  firstScanTitle: 'Scan your register?',
  firstScanBody: 'Photo or PDF of your bahi — or skip and talk to Munshi.',
  scanNow: 'Scan now',
  skip: 'Skip for later',
  homeKicker: 'Your bahi, spoken',
  homeHero: 'Bolke likho',
  pendingTotal: 'Pending udhaar',
  pendingList: 'Who owes',
  pendingEmpty: 'No pending udhaar. Talk to Munshi or scan.',
  scanPill: 'Scan',
  talkMunshi: 'Talk to Munshi',
  entriesN: (n) => `${n} entries`,
  scanTitle: 'Scan',
  scanCamera: 'Camera',
  scanGallery: 'Gallery',
  scanPdf: 'PDF',
  scanFrame: 'Align the page',
  processingUploading: 'Uploading…',
  processingProcessing: 'Reading your bahi…',
  processingParsing: 'Organizing entries…',
  reviewTitle: 'Confirm',
  reviewEmpty: 'No entries found — try a clearer photo.',
  confirmLine: 'Confirm',
  discardLine: 'Skip',
  saveConfirmed: (n) => `Save ${n} ${n === 1 ? 'entry' : 'entries'}`,
  selectPerson: 'Select person',
  whoIsThis: 'Whose khata?',
  fromContacts: 'From contacts',
  walkIn: 'Walk-in',
  searchContacts: 'Search contacts',
  credit: 'Credit',
  afterBal: 'Balance after',
  toastScanSaved: (n) => `${n} entries added`,
};

const hi: Strings = {
  splashEyebrow: 'आपकी दुकान के लिए',
  splashSub: 'कागज़ की बही से साफ़ ख़ाता — बोलकर लिखो।',
  start: 'शुरू करें',
  notifTitle: 'नरम यादें',
  notifBody: 'जब ख़ाता याद दिलाना हो — सिर्फ आपकी मर्ज़ी से।',
  contactsTitle: 'अपने लोग',
  contactsBody: 'रजिस्टर के नाम कॉन्टैक्ट से मिलाएँगे। डेटा यहीं फ़ोन पर।',
  allow: 'अनुमति दें',
  notNow: 'अभी नहीं',
  continueLabel: 'आगे',
  useDemo: 'नमूना सूची',
  chooseContacts: 'कॉन्टैक्ट चुनें',
  contactsImportTitle: 'कॉन्टैक्ट तैयार',
  contactsImportBody: (count) => `${count} कॉन्टैक्ट मैप के लिए तैयार।`,
  contactsImportEmpty: 'कॉन्टैक्ट नहीं — नमूना लें या बाद में जोड़ें।',
  mapTitle: 'बही के नाम',
  mapHint: 'जैसा नाम बही पर लिखते हो — वैसा यहाँ।',
  mapAliasPh: 'जैसे राजेश',
  mapDone: 'सेव · आगे',
  mapSkip: 'बाद में',
  firstScanTitle: 'बही स्कैन करें?',
  firstScanBody: 'फोटो या PDF — या छोड़कर मुंशी से बात करें।',
  scanNow: 'अभी स्कैन',
  skip: 'बाद में',
  homeKicker: 'बोलकर बही',
  homeHero: 'बोलके लिखो',
  pendingTotal: 'कुल उधार',
  pendingList: 'बाकी वाले',
  pendingEmpty: 'कोई उधार नहीं। मुंशी से बोलो या स्कैन करो।',
  scanPill: 'स्कैन',
  talkMunshi: 'मुंशी से बात',
  entriesN: (n) => `${n} एंट्री`,
  scanTitle: 'स्कैन',
  scanCamera: 'कैमरा',
  scanGallery: 'गैलरी',
  scanPdf: 'PDF',
  scanFrame: 'पेज संरेखित करें',
  processingUploading: 'भेजा जा रहा है…',
  processingProcessing: 'बही पढ़ रहे हैं…',
  processingParsing: 'एंट्री तैयार…',
  reviewTitle: 'कन्फर्म',
  reviewEmpty: 'एंट्री नहीं मिली — साफ़ फोटो आज़माएँ।',
  confirmLine: 'जोड़ो',
  discardLine: 'छोड़ो',
  saveConfirmed: (n) => `${n} एंट्री सेव`,
  selectPerson: 'व्यक्ति चुनें',
  whoIsThis: 'किसका ख़ाता?',
  fromContacts: 'कॉन्टैक्ट से',
  walkIn: 'वॉक-इन',
  searchContacts: 'खोजें',
  credit: 'उधार',
  afterBal: 'बाद बाकी',
  toastScanSaved: (n) => `${n} एंट्री जुड़े`,
};

const mr: Strings = {
  ...hi,
  splashEyebrow: 'तुमच्या दुकानासाठी',
  splashSub: 'कागदाची वही — बोलून लिहा.',
  start: 'सुरू करा',
  mapTitle: 'वही नावे',
  firstScanTitle: 'वही स्कॅन करायची?',
  skip: 'नंतर',
  homeHero: 'बोलून लिहा',
  pendingTotal: 'एकूण उधार',
  talkMunshi: 'मुंशीशी बोला',
};

const ta: Strings = {
  ...en,
  splashEyebrow: 'உங்கள் கடைக்கு',
  splashSub: 'பேசி எழுதும் கணக்கு.',
  start: 'தொடங்கு',
  mapTitle: 'பதிவேட்டு பெயர்',
  firstScanTitle: 'ரெஜிஸ்டர் ஸ்கேன்?',
  skip: 'பிறகு',
  homeHero: 'பேசி பதிவு',
  pendingTotal: 'நிலுவை கடன்',
  talkMunshi: 'முன்ஷியிடம் பேசு',
};

const DICT: Record<AppLanguage, Strings> = { hi, en, mr, ta };

export function useStrings(language: AppLanguage): Strings {
  return DICT[language] ?? en;
}

export const LANGUAGE_LABELS: { code: AppLanguage; native: string; english: string }[] = [
  { code: 'hi', native: 'हिन्दी', english: 'Hindi' },
  { code: 'en', native: 'English', english: 'EN' },
  { code: 'mr', native: 'मराठी', english: 'Marathi' },
  { code: 'ta', native: 'தமிழ்', english: 'Tamil' },
];
