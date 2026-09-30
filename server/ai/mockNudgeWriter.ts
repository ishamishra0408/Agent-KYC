import { REASONS } from "../domain/reasons";
import type { Language } from "../domain/types";
import type { NudgeWriter } from "./nudgeWriter";

const TEMPLATES: Record<"NOT_STARTED" | "DOCS_PENDING", Record<Language, (name: string) => string>> = {
  NOT_STARTED: {
    en: (n) => `Hi ${n}, finish your KYC to start getting loads. It takes about 5 minutes.`,
    hi: (n) => `नमस्ते ${n} जी, लोड पाने के लिए अपना KYC पूरा करें। इसमें लगभग 5 मिनट लगते हैं।`,
  },
  DOCS_PENDING: {
    en: (n) => `${n}, you're almost there. Upload your remaining documents to start booking loads.`,
    hi: (n) => `${n} जी, बस थोड़ा बाकी है। लोड बुक करने के लिए बाकी दस्तावेज़ अपलोड करें।`,
  },
};

// Stand-in for the AI nudge writer (Phase 3), so the whole loop runs offline.
export const mockNudgeWriter: NudgeWriter = {
  name: "mock-templates",
  async draft({ name, language, blocker, fixReason, renewBy }) {
    if (blocker === "LICENCE_EXPIRED" && renewBy) {
      const date = new Date(`${renewBy}T00:00:00Z`).toLocaleDateString(language === "hi" ? "hi-IN" : "en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
      return language === "hi"
        ? `${name} जी, आपका ड्राइविंग लाइसेंस ${date} को खत्म हो गया। लोड फिर से बुक करने के लिए नया लाइसेंस अपलोड करें।`
        : `${name}, your driving licence ran out on ${date}. Upload your renewed licence to book loads again.`;
    }
    if (blocker === "RENEW_LICENCE" && renewBy) {
      const date = new Date(`${renewBy}T00:00:00Z`).toLocaleDateString(language === "hi" ? "hi-IN" : "en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
      return language === "hi"
        ? `${name} जी, आपका ड्राइविंग लाइसेंस ${date} को खत्म हो रहा है। लोड बुक करते रहने के लिए समय पर रिन्यू करवा लें।`
        : `${name}, your driving licence runs out on ${date}. Renew it in time to keep booking loads.`;
    }
    if (blocker === "NEEDS_FIX" && fixReason) {
      const fix = REASONS[fixReason].driver[language];
      return language === "hi" ? `${name} जी, एक चीज़ ठीक करनी है: ${fix}` : `${name}, one thing to fix: ${fix}`;
    }
    return TEMPLATES[blocker === "NOT_STARTED" ? "NOT_STARTED" : "DOCS_PENDING"][language](name);
  },
};
