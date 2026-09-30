import type { NoticeCode, ReasonCode, Severity } from "./types";

interface ReasonInfo {
  severity: Severity;
  driver: { en: string; hi: string };
  ops: string;
}

// Review reasons all show the driver the same calm message: a person is on it.
// It never says why, so a hidden-instruction attempt isn't tipped off.
export const WAITING = {
  en: "A person is checking your documents. You don't need to do anything.",
  hi: "आपके दस्तावेज़ जाँचे जा रहे हैं। आपको कुछ करने की ज़रूरत नहीं है।",
};

export const REASONS: Record<ReasonCode, ReasonInfo> = {
  PHOTO_BLURRY: {
    severity: "fix",
    driver: {
      en: "The photo is blurry. Hold your phone steady and retake it.",
      hi: "फोटो धुंधली है। फ़ोन स्थिर रखकर दोबारा फोटो लें।",
    },
    ops: "Photo too blurry to read.",
  },
  PHOTO_GLARE: {
    severity: "fix",
    driver: {
      en: "There's glare on the card. Tilt it away from the light and retake it.",
      hi: "कार्ड पर चमक है। कार्ड को रोशनी से थोड़ा हटाकर दोबारा फोटो लें।",
    },
    ops: "Glare hides key fields.",
  },
  PHOTO_CROPPED: {
    severity: "fix",
    driver: {
      en: "Part of the card is cut off. Fit the whole card in the frame.",
      hi: "कार्ड का कुछ हिस्सा कट गया है। पूरा कार्ड फ्रेम में रखें।",
    },
    ops: "Card cropped; fields missing.",
  },
  PHOTO_DARK: {
    severity: "fix",
    driver: {
      en: "The photo is too dark. Move somewhere brighter and retake it.",
      hi: "फोटो बहुत अंधेरी है। रोशनी वाली जगह पर दोबारा फोटो लें।",
    },
    ops: "Photo too dark to read.",
  },
  SCREEN_PHOTO: {
    severity: "fix",
    driver: {
      en: "This looks like a photo of a screen. Photograph the card itself, or use DigiLocker.",
      hi: "यह स्क्रीन की फोटो लग रही है। असली कार्ड की फोटो लें, या DigiLocker इस्तेमाल करें।",
    },
    ops: "Photo of a screen, not the physical card.",
  },
  WRONG_DOCUMENT: {
    severity: "fix",
    driver: {
      en: "This isn't the document we asked for. Upload the right one.",
      hi: "यह वह दस्तावेज़ नहीं है जो हमने माँगा था। सही दस्तावेज़ अपलोड करें।",
    },
    ops: "Uploaded image is a different document type.",
  },
  MISSING_DOCUMENT: {
    severity: "fix",
    driver: {
      en: "A document is still missing.",
      hi: "एक दस्तावेज़ अभी बाकी है।",
    },
    ops: "Required document not provided.",
  },
  DL_EXPIRED: {
    severity: "fix",
    driver: {
      en: "Your driving licence has expired. Upload your renewed licence.",
      hi: "आपका ड्राइविंग लाइसेंस एक्सपायर हो गया है। नया लाइसेंस अपलोड करें।",
    },
    ops: "Driving licence expired per registry.",
  },
  BANK_NAME_MISMATCH: {
    severity: "fix",
    driver: {
      en: "The name on the bank account doesn't match your licence. Use an account in your name.",
      hi: "बैंक खाते का नाम आपके लाइसेंस से मेल नहीं खाता। अपने नाम का खाता इस्तेमाल करें।",
    },
    ops: "Bank holder name matches neither the driver nor a verified fleet owner.",
  },
  OWNER_LINK_UNVERIFIED: {
    severity: "fix",
    driver: {
      en: "Ask your fleet owner to confirm you in their app, or use an account in your name.",
      hi: "अपने फ्लीट मालिक से ऐप में आपकी पुष्टि करने को कहें, या अपने नाम का खाता इस्तेमाल करें।",
    },
    ops: "Hired driver uses the fleet owner's account; the owner hasn't confirmed the link yet.",
  },
  OWNER_NOT_VERIFIED: {
    severity: "fix",
    driver: {
      en: "Your fleet owner needs to finish their own KYC first. Then ask them to confirm you in their app, or use an account in your name.",
      hi: "आपके फ्लीट मालिक को पहले अपना KYC पूरा करना होगा। फिर उनसे ऐप में आपकी पुष्टि करने को कहें, या अपने नाम का खाता इस्तेमाल करें।",
    },
    ops: "Hired driver uses a fleet owner's account; that owner hasn't passed KYC yet.",
  },
  BANK_NOT_VERIFIED: {
    severity: "fix",
    driver: {
      en: "We couldn't verify your bank account. Try the Rs 1 check again.",
      hi: "हम आपका बैंक खाता नहीं जाँच पाए। ₹1 वाली जाँच फिर से करें।",
    },
    ops: "Rs 1 reverse penny-drop check failed.",
  },
  DOB_MISMATCH: {
    severity: "review",
    driver: WAITING,
    ops: "Date of birth differs between licence and PAN.",
  },
  NAME_MISMATCH_IDS: {
    severity: "review",
    driver: WAITING,
    ops: "Licence and PAN name different people.",
  },
  PRINTED_REGISTRY_MISMATCH: {
    severity: "review",
    driver: WAITING,
    ops: "Printed details differ from the registry record. Possible tampering.",
  },
  SUSPICIOUS_TEXT: {
    severity: "review",
    driver: WAITING,
    ops: "Document contains text aimed at the verification system.",
  },
  DL_NOT_FOUND: {
    severity: "review",
    driver: WAITING,
    ops: "Licence number not found in the registry.",
  },
  PAN_NOT_FOUND: {
    severity: "review",
    driver: WAITING,
    ops: "PAN not found in the registry.",
  },
  FACE_MISMATCH: {
    severity: "review",
    driver: WAITING,
    ops: "Selfie doesn't match the licence photo.",
  },
  LOW_CONFIDENCE: {
    severity: "review",
    driver: WAITING,
    ops: "The document reader isn't confident. A person should look.",
  },
  SHARED_BANK_ACCOUNT: {
    severity: "review",
    driver: WAITING,
    ops: "Bank account shared with drivers who have no link to its holder.",
  },
  DOCUMENT_TAMPERED: {
    severity: "review",
    driver: WAITING,
    ops: "The document looks edited after it was made. Compare it with the registry.",
  },
  GRAPH_UNAVAILABLE: {
    severity: "review",
    driver: WAITING,
    ops: "The trust graph couldn't be reached, so the shared-account check didn't run.",
  },
  NUMBER_UNREADABLE: {
    severity: "fix",
    driver: {
      en: "We couldn't read the number on your document. Retake the photo so the number is clear.",
      hi: "आपके दस्तावेज़ का नंबर पढ़ा नहीं जा सका। नंबर साफ़ दिखे, ऐसी फोटो दोबारा लें।",
    },
    ops: "Photo passed checks but no number was read, so the registry couldn't be checked.",
  },
  SELFIE_MISSING: {
    severity: "fix",
    driver: {
      en: "Take a quick selfie so we can match it to your licence.",
      hi: "एक सेल्फ़ी लें ताकि हम उसे आपके लाइसेंस से मिला सकें।",
    },
    ops: "No selfie match has been run yet.",
  },
  REPEATED_FIX: {
    severity: "review",
    driver: WAITING,
    ops: "The same fix has been asked for twice already. A person should help instead of a third request.",
  },
  REVIEWER_FIX: {
    severity: "fix",
    driver: {
      en: "A reviewer asked you to redo one step. Their note is in your chat.",
      hi: "समीक्षक ने एक कदम दोबारा करने को कहा है। उनका संदेश आपकी चैट में है।",
    },
    ops: "A reviewer asked the driver to redo a step.",
  },
};

// Notices don't change an outcome. They tell ops what to keep an eye on.
export const NOTICES: Record<NoticeCode, { ops: string }> = {
  LICENCE_EXPIRES_SOON: { ops: "Licence runs out soon. The driver gets one renewal reminder." },
  OWNER_LINK_UNCONFIRMED: { ops: "Names a fleet owner whose link isn't verified (not confirmed, or the owner hasn't passed KYC). Payouts go to the driver's own account." },
};
