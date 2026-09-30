// Client for the KYCReady API. Types mirror the server's responses.

export type Status =
  | "SIGNED_UP"
  | "CONSENTED"
  | "DOCS_IN_PROGRESS"
  | "SUBMITTED"
  | "NEEDS_FIX"
  | "IN_REVIEW"
  | "APPROVED"
  | "ACTIVE"
  | "LICENCE_EXPIRED"
  | "REJECTED";
export type Slot = "DL" | "PAN" | "BANK_PROOF";
export type Step = "CONSENT" | "DL" | "PAN" | "BANK" | "SELFIE" | "SUBMIT";
export type Lang = "en" | "hi";
export type Variant = "clean" | "blurry" | "glare" | "screen";
export type Faq = "why_bank" | "data_safe" | "no_pan" | "person";
export type Choice = "APPROVE" | "NEEDS_FIX" | "REJECT";
export type FixStep = "DL" | "PAN" | "BANK" | "SELFIE"; // the step a reviewer can send a driver back to

export interface DriverSummary {
  id: string;
  name: string;
  partnerType: string;
  status: Status;
  language: Lang;
  nextStep: Step | null;
}

export interface AppState {
  clock: string;
  drivers: DriverSummary[];
}

export interface DocSummary {
  source: "photo" | "digilocker";
  shotId: string | null;
  issue: string | null;
  url: string | null;
}

export interface ChatMessage {
  role: "assistant" | "driver" | "system";
  author: string;
  text: string;
  at: string;
}

export interface InboxItem {
  at: string;
  kind: "send" | "status_update";
  text: string | null;
  deepLink: string | null;
  writer: string | null;
}

export interface DriverView {
  driver: { id: string; name: string; partnerType: string; status: Status; language: Lang; optedOut: boolean };
  nextStep: Step | null;
  steps: { bank: boolean; selfie: boolean };
  documents: Partial<Record<Slot, DocSummary>>;
  decision: { outcome: string; by: string; at: string; fixes: { code: string; message: string }[] } | null;
  chat: ChatMessage[];
  inbox: InboxItem[];
  canBook: boolean;
  bookings: { loadId: string; at: string }[];
}

export interface Load {
  id: string;
  from: string;
  to: string;
  vehicle: string;
  when: string;
  fare: number;
  distanceKm: number;
}

export interface Reason {
  code: string;
  severity: "fix" | "review";
  doc?: Slot;
  driverMessage: string;
  opsMessage: string;
  evidence?: Record<string, unknown>;
}

export interface PassedCheck {
  check: string;
  evidence: Record<string, unknown>;
  simulated: boolean;
}

export interface Sharer {
  driverId: string;
  name: string;
  isHolder: boolean;
  claimsHolderAsOwner: boolean;
}

export interface CaseView {
  driver: { id: string; name: string; phone: string; partnerType: string; status: Status; fleetOwnerId?: string; ownerLinkVerified?: boolean };
  decision: {
    outcome: string;
    actor: string;
    at: string;
    rulesVersion: string | null;
    reasons: Reason[];
    passed: PassedCheck[];
    note: string | null;
  } | null;
  notices: { code: string; opsMessage: string; evidence: Record<string, unknown> }[];
  summary: string | null;
  documents: Partial<
    Record<
      Slot,
      {
        source: string;
        shotId: string | null;
        issue: string | null;
        quality: string | null;
        fields: Record<string, string | undefined>;
        suspiciousText: string | null;
        readBy: string | null;
        fallbackReason: string | null;
        url: string | null;
      }
    >
  >;
  graph: { status: "ok" | "unavailable"; sharedBankAccount: { accountId: string; holderName: string; sharers: Sharer[] } | null };
  graphSource: string | null;
  events: { at: string; actor: string; type: string; from: string | null; to: string | null }[];
  registrySimulated: boolean;
}

export interface ReviewItem {
  id: string;
  name: string;
  partnerType: string;
  since: string;
  reasons: string[];
}

export interface NudgeLogItem {
  at: string;
  driverId: string;
  driver: string;
  blocker: string;
  action: "send" | "status_update" | "hold";
  reason: string;
  notBefore: string | null;
  text: string | null;
  deepLink: string | null;
  writer: string | null;
}

export interface Funnel {
  stages: { key: string; label: string; count: number }[];
  now: { inReview: number; needsFix: number };
  decidedWithoutPerson: number | null;
  nudgesPerActivated: number | null;
}

export interface EvalSummary {
  suite: string;
  reader: string;
  readerKind: string;
  ranAt: string;
  rulesVersion: string;
  bad: number;
  badApproved: number;
  good: number;
  goodApproved: number;
  gatePassed: boolean;
}

export interface CycleItem {
  driverId: string;
  action: "send" | "status_update" | "hold" | "skip";
  reason: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(method: "GET" | "POST", url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

const d = (id: string) => `/api/drivers/${encodeURIComponent(id)}`;

export const api = {
  state: () => request<AppState>("GET", "/api/state"),
  driver: (id: string) => request<DriverView>("GET", d(id)),
  shots: (id: string, slot: Slot) => request<{ variant: Variant; url: string }[]>("GET", `${d(id)}/shots/${slot}`),
  consent: (id: string) => request("POST", `${d(id)}/consent`),
  photo: (id: string, slot: Slot, variant: Variant) => request<{ issue: string | null }>("POST", `${d(id)}/photo`, { slot, variant }),
  digilocker: (id: string, slot: "DL" | "PAN") => request("POST", `${d(id)}/digilocker`, { slot }),
  bankCheck: (id: string) => request("POST", `${d(id)}/bank-check`),
  selfie: (id: string) => request("POST", `${d(id)}/selfie`),
  submit: (id: string) => request<{ outcome: string }>("POST", `${d(id)}/submit`),
  ask: (id: string, faq: Faq) => request("POST", `${d(id)}/ask`, { faq }),
  language: (id: string, language: Lang) => request("POST", `${d(id)}/language`, { language }),
  optOut: (id: string, optedOut: boolean) => request("POST", `${d(id)}/opt-out`, { optedOut }),
  loads: (id: string) => request<{ loads: Load[]; bookings: { loadId: string; at: string }[] }>("GET", `${d(id)}/loads`),
  book: (id: string, loadId: string) => request<{ ok: true; firstTrip?: boolean }>("POST", `${d(id)}/loads/${loadId}/book`),
  review: () => request<ReviewItem[]>("GET", "/api/ops/review"),
  caseView: (id: string) => request<CaseView>("GET", `/api/ops/drivers/${encodeURIComponent(id)}/case`),
  decide: (id: string, choice: Choice, note: string, step?: FixStep) =>
    request<{ status: Status }>("POST", `/api/ops/drivers/${encodeURIComponent(id)}/decision`, { choice, note, step }),
  confirmOwner: (id: string) =>
    request<{ ownerLinkVerified: boolean }>("POST", `/api/ops/drivers/${encodeURIComponent(id)}/confirm-owner`),
  nudges: () => request<NudgeLogItem[]>("GET", "/api/ops/nudges"),
  funnel: () => request<Funnel>("GET", "/api/ops/funnel"),
  evals: () => request<EvalSummary[]>("GET", "/api/ops/evals"),
  advance: (hours: number) => request<{ clock: string; cycle: CycleItem[] }>("POST", "/api/demo/advance", { hours }),
  reset: () => request("POST", "/api/demo/reset"),
};
