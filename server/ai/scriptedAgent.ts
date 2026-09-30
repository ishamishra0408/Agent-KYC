import { REASONS, WAITING } from "../domain/reasons";
import { VEHICLE_REASONS, type VehicleReasonCode } from "../domain/vehicle";
import type { DocType, Outcome, ReasonCode } from "../domain/types";

// The onboarding assistant's lines, scripted until Phase 3 swaps in the AI agent.
// Pure: it only turns events into words. It can't read or change a driver's status.

export type Lang = "en" | "hi";
export type KycStep = "CONSENT" | "DL" | "PAN" | "BANK" | "SELFIE" | "SUBMIT";
export type FaqId = "why_bank" | "data_safe" | "no_pan" | "person";

type Text = Record<Lang, string>;

const STEP_PROMPT: Record<Exclude<KycStep, "CONSENT">, Text> = {
  DL: {
    en: "Let's start with your driving licence. Take a photo of the front, or fetch it from DigiLocker.",
    hi: "पहले अपना ड्राइविंग लाइसेंस। सामने की तरफ़ की फोटो लें, या DigiLocker से लाएँ।",
  },
  PAN: {
    en: "Now your PAN card. A photo works, or use DigiLocker.",
    hi: "अब अपना PAN कार्ड। फोटो लें या DigiLocker इस्तेमाल करें।",
  },
  BANK: {
    en: "Next, your bank account. Enter its number and IFSC, and we'll send Rs 1 to check it's open.",
    hi: "अब बैंक खाता। उसका नंबर और IFSC डालें, हम ₹1 भेजकर देखेंगे कि खाता चालू है।",
  },
  SELFIE: {
    en: "Last step: a quick selfie, so we can match it to your licence.",
    hi: "आख़िरी कदम: एक सेल्फ़ी, ताकि हम उसे आपके लाइसेंस से मिला सकें।",
  },
  SUBMIT: {
    en: "That's everything. Tap submit and we'll check it right away.",
    hi: "सब हो गया। सबमिट दबाएँ, हम तुरंत जाँच करेंगे।",
  },
};

const LINES = {
  welcome: {
    en: (n: string) => `Hi ${n}! I'll help you finish KYC so you can start booking loads. It takes about 5 minutes.`,
    hi: (n: string) => `नमस्ते ${n} जी! KYC पूरा करने में मैं आपकी मदद के लिए हूँ, ताकि आप लोड बुक कर सकें। लगभग 5 मिनट लगेंगे।`,
  },
  photoOk: { en: "Got it, that photo is clear.", hi: "मिल गया, फोटो साफ़ है।" },
  unclear: {
    en: "I couldn't read that clearly. Try another photo in good light.",
    hi: "यह फोटो साफ़ पढ़ी नहीं जा सकी। अच्छी रोशनी में दूसरी फोटो लें।",
  },
  digilocker: { en: "Fetched from DigiLocker. No photo needed.", hi: "DigiLocker से मिल गया। फोटो की ज़रूरत नहीं।" },
  bank: {
    en: (last4: string) => `Rs 1 sent to the account ending ${last4}. We'll match the name on it when you submit.`,
    hi: (last4: string) => `₹1 उस खाते में भेजा जिसके आख़िरी अंक ${last4} हैं। सबमिट करने पर हम उस पर लिखा नाम मिलाएँगे।`,
  },
  bankNotFound: {
    en: (left: number) => `No account found for that number and IFSC. Check them and try again (${left} ${left === 1 ? "try" : "tries"} left).`,
    hi: (left: number) => `इस नंबर और IFSC से कोई खाता नहीं मिला। जाँचकर फिर कोशिश करें (${left} बार और)।`,
  },
  vehicleOk: {
    en: (n: string) => `Vehicle ${n} is verified. You can book loads now.`,
    hi: (n: string) => `गाड़ी ${n} वेरिफ़ाई हो गई। अब आप लोड बुक कर सकते हैं।`,
  },
  bankLocked: {
    en: "That's three tries in 24 hours. Try again later, or ask for help.",
    hi: "24 घंटे में तीन बार कोशिश हो चुकी है। बाद में फिर कोशिश करें, या मदद माँगें।",
  },
  selfie: { en: "Selfie taken.", hi: "सेल्फ़ी हो गई।" },
  approved: {
    en: "You're verified! Bookings are open, and there are loads near you.",
    hi: "आपका वेरिफ़िकेशन हो गया! अब आप लोड बुक कर सकते हैं।",
  },
  approvedAddVehicle: {
    en: "You're verified! Add your vehicle in Loads, and you can start booking.",
    hi: "आपका वेरिफ़िकेशन हो गया! Loads में अपनी गाड़ी जोड़ें, फिर आप बुकिंग शुरू कर सकते हैं।",
  },
  fixIntro: { en: "One thing to fix:", hi: "एक चीज़ ठीक करनी है:" },
  fixIntroMany: { en: "A few things to fix:", hi: "कुछ चीज़ें ठीक करनी हैं:" },
} satisfies Record<string, Text | Record<Lang, (n: string) => string> | Record<Lang, (n: number) => string>>;

export const FAQ: Record<FaqId, { q: Text; a: Text }> = {
  why_bank: {
    q: { en: "Why do you need my bank details?", hi: "बैंक की जानकारी क्यों चाहिए?" },
    a: {
      en: "So we can pay you for every trip. We only ever show the last 4 digits of your account.",
      hi: "आपको हर ट्रिप का पैसा भेजने के लिए। हम आपके खाते के सिर्फ़ आख़िरी 4 अंक दिखाते हैं।",
    },
  },
  data_safe: {
    q: { en: "Is my data safe?", hi: "क्या मेरी जानकारी सुरक्षित है?" },
    a: {
      en: "Your documents are used only to verify you and are never shown to other drivers. In this demo, every document is a SPECIMEN.",
      hi: "आपके दस्तावेज़ सिर्फ़ आपकी पहचान जाँचने के लिए इस्तेमाल होते हैं, किसी और ड्राइवर को नहीं दिखते। इस डेमो में सभी दस्तावेज़ SPECIMEN हैं।",
    },
  },
  no_pan: {
    q: { en: "I don't have a PAN card", hi: "मेरे पास PAN कार्ड नहीं है" },
    a: {
      en: "You can apply for a PAN online; it usually takes a few days. Meanwhile, finish the other steps and come back.",
      hi: "PAN के लिए ऑनलाइन आवेदन कर सकते हैं, आमतौर पर कुछ दिन लगते हैं। तब तक बाकी कदम पूरे कर लें।",
    },
  },
  person: {
    q: { en: "Talk to a person", hi: "किसी व्यक्ति से बात करनी है" },
    a: {
      en: "I've asked our team to call you. In this demo nobody will actually call.",
      hi: "मैंने हमारी टीम से आपको कॉल करने को कहा है। इस डेमो में असल में कॉल नहीं आएगी।",
    },
  },
};

export type AgentEvent =
  | { type: "welcome"; name: string }
  | { type: "prompt"; step: KycStep }
  | { type: "photo"; slot: DocType; issue: ReasonCode | null }
  | { type: "digilocker" }
  | { type: "bank_checked"; last4: string }
  | { type: "bank_not_found"; triesLeft: number }
  | { type: "bank_locked" }
  | { type: "vehicle_ok"; number: string }
  | { type: "vehicle_fix"; fixes: VehicleReasonCode[] }
  | { type: "selfie_taken" }
  | { type: "decision"; outcome: Outcome; fixes: ReasonCode[]; needsVehicle?: boolean }
  | { type: "faq"; id: FaqId };

// Turns one event into the assistant's lines, in the driver's language.
export function agentSay(event: AgentEvent, lang: Lang): string[] {
  switch (event.type) {
    case "welcome":
      return [LINES.welcome[lang](event.name)];
    case "prompt":
      return event.step === "CONSENT" ? [] : [STEP_PROMPT[event.step][lang]];
    case "photo":
      // Coaching uses the same wording the rules would use, the moment the photo is taken.
      // An unsure reader means "try again" here, never "a person is checking" mid-capture.
      if (!event.issue) return [LINES.photoOk[lang]];
      if (REASONS[event.issue].severity === "review") return [LINES.unclear[lang]];
      return [REASONS[event.issue].driver[lang]];
    case "digilocker":
      return [LINES.digilocker[lang]];
    case "bank_checked":
      return [LINES.bank[lang](event.last4)];
    case "bank_not_found":
      return [LINES.bankNotFound[lang](event.triesLeft)];
    case "bank_locked":
      return [LINES.bankLocked[lang]];
    case "vehicle_ok":
      return [LINES.vehicleOk[lang](event.number)];
    case "vehicle_fix":
      return [[...new Set(event.fixes.map((f) => VEHICLE_REASONS[f].driver[lang]))].join("\n")];
    case "selfie_taken":
      return [LINES.selfie[lang]];
    case "decision":
      if (event.outcome === "APPROVE") return [(event.needsVehicle ? LINES.approvedAddVehicle : LINES.approved)[lang]];
      if (event.outcome === "REVIEW") return [WAITING[lang]];
      // One message: the intro, then each fix on its own line, said once.
      return [[(event.fixes.length > 1 ? LINES.fixIntroMany : LINES.fixIntro)[lang], ...new Set(event.fixes.map((f) => REASONS[f].driver[lang]))].join("\n")];
    case "faq":
      return [FAQ[event.id].a[lang]];
  }
}
