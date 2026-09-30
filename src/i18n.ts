import type { Lang, Status, Step } from "./api";

// Driver-app wording in English and Hindi. The assistant's own lines come from the server.
const STRINGS = {
  tabInbox: { en: "Inbox", hi: "सूचनाएँ" },
  unread: { en: "unread", hi: "नई" },
  tabKyc: { en: "KYC", hi: "KYC" },
  tabLoads: { en: "Loads", hi: "लोड" },
  takePhoto: { en: "Take photo", hi: "फोटो लें" },
  checkingPhoto: { en: "Checking your photo", hi: "आपकी फोटो जाँची जा रही है" },
  useDigilocker: { en: "Use DigiLocker", hi: "DigiLocker से लाएँ" },
  accountNumber: { en: "Account number", hi: "खाता नंबर" },
  vehicleTitle: { en: "Add your vehicle to book loads", hi: "लोड बुक करने के लिए अपनी गाड़ी जोड़ें" },
  vehicleNumber: { en: "Registration number", hi: "रजिस्ट्रेशन नंबर" },
  checkVehicle: { en: "Check vehicle", hi: "गाड़ी जाँचें" },
  ifsc: { en: "IFSC", hi: "IFSC" },
  verifyAccount: { en: "Send Rs 1 to check", hi: "₹1 भेजकर जाँचें" },
  takeSelfie: { en: "Take selfie", hi: "सेल्फ़ी लें" },
  submit: { en: "Submit for checking", hi: "जाँच के लिए सबमिट करें" },
  agree: { en: "I agree", hi: "मैं सहमत हूँ" },
  book: { en: "Book", hi: "बुक करें" },
  booked: { en: "Booked", hi: "बुक हो गया" },
  continueKyc: { en: "Continue KYC", hi: "KYC जारी रखें" },
  open: { en: "Open", hi: "खोलें" },
  stopReminders: { en: "Stop reminders", hi: "रिमाइंडर बंद करें" },
  remindersOff: { en: "Reminders are off. Turn them on", hi: "रिमाइंडर बंद हैं। फिर से चालू करें" },
  noMessages: { en: "No messages yet.", hi: "अभी कोई संदेश नहीं।" },
  cameraTitle: { en: "Demo camera", hi: "डेमो कैमरा" },
  cancel: { en: "Cancel", hi: "रद्द करें" },
  lockedTitle: { en: "Finish verification to book loads", hi: "लोड बुक करने के लिए वेरिफ़िकेशन पूरा करें" },
  firstTrip: { en: "First load booked. Have a good trip!", hi: "पहला लोड बुक हो गया। सफ़र शुभ हो!" },
  consentTitle: { en: "Before we start", hi: "शुरू करने से पहले" },
  consentBody: {
    en: "We'll check your driving licence, PAN, bank account and a selfie, only to verify and pay you. We keep them only as long as the law requires and never show them to other drivers.",
    hi: "हम आपका ड्राइविंग लाइसेंस, PAN, बैंक खाता और एक सेल्फ़ी सिर्फ़ पहचान जाँचने और पेमेंट के लिए देखेंगे। इन्हें कानून के हिसाब से ज़रूरी समय तक ही रखा जाएगा, और किसी और ड्राइवर को नहीं दिखाया जाएगा।",
  },
  expiredTitle: { en: "Your licence has expired", hi: "आपका लाइसेंस एक्सपायर हो गया है" },
  expiredBody: { en: "Upload your renewed licence to book loads again.", hi: "लोड फिर से बुक करने के लिए नया लाइसेंस अपलोड करें।" },
  submitAgain: { en: "Submit again", hi: "दोबारा सबमिट करें" },
  sampleLoads: { en: "Loads near you", hi: "आपके पास के लोड" },
  fleetOwner: { en: "Fleet owner", hi: "फ्लीट मालिक" },
  dispatch: { en: "Dispatch", hi: "डिस्पैच" },
  assistant: { en: "Assistant · scripted", hi: "सहायक · स्क्रिप्टेड" },
  rules: { en: "Rules check", hi: "नियमों की जाँच" },
  reviewer: { en: "Reviewer", hi: "समीक्षक" },
} as const;

export type StringKey = keyof typeof STRINGS;

export function t(lang: Lang, key: StringKey): string {
  return STRINGS[key][lang];
}

export const STEP_LABEL: Record<Step, Record<Lang, string>> = {
  CONSENT: { en: "Consent", hi: "सहमति" },
  DL: { en: "Licence", hi: "लाइसेंस" },
  PAN: { en: "PAN", hi: "PAN" },
  BANK: { en: "Bank", hi: "बैंक" },
  SELFIE: { en: "Selfie", hi: "सेल्फ़ी" },
  SUBMIT: { en: "Submit", hi: "सबमिट" },
};

export const STATUS_LABEL: Record<Status, string> = {
  SIGNED_UP: "Signed up",
  CONSENTED: "Consented",
  DOCS_IN_PROGRESS: "Uploading documents",
  SUBMITTED: "Checking",
  NEEDS_FIX: "Needs a fix",
  IN_REVIEW: "With a reviewer",
  APPROVED: "Approved",
  ACTIVE: "First load booked",
  LICENCE_EXPIRED: "Licence expired",
  REJECTED: "Rejected",
};

export const STATUS_LABEL_HI: Record<Status, string> = {
  SIGNED_UP: "साइन अप किया",
  CONSENTED: "सहमति दी",
  DOCS_IN_PROGRESS: "दस्तावेज़ बाकी",
  SUBMITTED: "जाँच जारी",
  NEEDS_FIX: "कुछ ठीक करना है",
  IN_REVIEW: "समीक्षक के पास",
  APPROVED: "वेरिफ़ाइड",
  ACTIVE: "पहला लोड बुक",
  LICENCE_EXPIRED: "लाइसेंस एक्सपायर",
  REJECTED: "अस्वीकृत",
};

// Short photo-problem labels for the driver's document tiles.
export const ISSUE_LABEL: Record<string, Record<Lang, string>> = {
  PHOTO_BLURRY: { en: "Blurry", hi: "धुंधली" },
  PHOTO_GLARE: { en: "Glare", hi: "चमक" },
  PHOTO_CROPPED: { en: "Cut off", hi: "कटी हुई" },
  PHOTO_DARK: { en: "Too dark", hi: "अंधेरी" },
  SCREEN_PHOTO: { en: "Screen photo", hi: "स्क्रीन फोटो" },
  WRONG_DOCUMENT: { en: "Wrong document", hi: "गलत दस्तावेज़" },
  LOW_CONFIDENCE: { en: "Unclear", hi: "साफ़ नहीं" },
};

export const PARTNER_LABEL: Record<string, string> = {
  owner_driver: "Owner-driver",
  fleet_owner: "Fleet owner",
  hired_driver: "Hired driver",
};

export function istTime(iso: string, withDay = false, lang: Lang = "en"): string {
  return new Date(iso).toLocaleString(lang === "hi" ? "hi-IN" : "en-IN", {
    timeZone: "Asia/Kolkata",
    ...(withDay ? { weekday: "short", day: "numeric", month: "short" } : {}),
    hour: "numeric",
    minute: "2-digit",
  });
}
