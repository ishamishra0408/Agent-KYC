import { Bell, IdCard, Truck as TruckIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, type Status } from "../api";
import { useAction, useData } from "../data";
import { istTime, t } from "../i18n";
import { StatusPill, tabList } from "../ui";
import { confetti, play } from "../whimsy";
import { Inbox } from "./Inbox";
import { Kyc } from "./Kyc";
import { Loads } from "./Loads";

type Tab = "inbox" | "kyc" | "loads";
const TABS: readonly Tab[] = ["inbox", "kyc", "loads"];

// The driver's phone. Opens on the inbox, where the nudge that brought them back is waiting.
export function PhoneApp({ id, bare = false }: { id: string; bare?: boolean }) {
  const { data: view, error } = useData(() => api.driver(id), [id]);
  const { data: state } = useData(() => api.state(), []);
  const { run } = useAction();
  const [tab, setTab] = useState<Tab>("inbox");
  const [seen, setSeen] = useState(0);
  const [focus, setFocus] = useState<string | null>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const lastStatus = useRef<Status | null>(null);

  // The top bar and the tab bar are glass floating over the page (D-037). The page leaves room for
  // them, measured rather than guessed, so a longer Hindi label or a bigger font never hides content.
  const ready = view != null;
  useLayoutEffect(() => {
    const phone = phoneRef.current;
    if (!ready || !phone) return;
    const measure = () => {
      phone.style.setProperty("--phone-top-h", `${topRef.current?.offsetHeight ?? 0}px`);
      phone.style.setProperty("--phone-tabs-h", `${barRef.current?.offsetHeight ?? 0}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const el of [topRef.current, barRef.current]) if (el) ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  const inboxCount = view?.inbox.length ?? 0;
  useEffect(() => {
    if (tab === "inbox") setSeen(inboxCount);
  }, [tab, inboxCount]);

  // Celebrate the moment the rules approve: the one moment this whole flow exists for.
  const status = view?.driver.status ?? null;
  useEffect(() => {
    if (!status) return;
    if (lastStatus.current && lastStatus.current !== "APPROVED" && status === "APPROVED") {
      confetti(phoneRef.current);
      play("chime");
    }
    lastStatus.current = status;
  }, [status]);

  const shell = `phone ${bare ? "bare" : ""}`;
  if (!view) {
    return (
      <div className={shell} ref={phoneRef}>
        {error ? <div className="empty">Couldn't load this driver: {error.message}</div> : <div className="empty">Loading…</div>}
      </div>
    );
  }

  const lang = view.driver.language;
  const unread = Math.max(0, inboxCount - seen);

  // A tapped notification lands on the step it's about.
  const openLink = (link: string | null) => {
    if (!link) return;
    play("pop");
    if (link.startsWith("/loads")) {
      setTab("loads");
      return;
    }
    setFocus(link);
    setTab("kyc");
  };

  const go = (next: Tab) => {
    play("click");
    setTab(next);
  };
  const tabs = tabList(TABS, tab, go, `phone-${id}`);

  return (
    <div className={shell} ref={phoneRef} role="region" aria-label={`${view.driver.name}'s phone`}>
      <div className="phone-top" ref={topRef}>
        {!bare && (
          <div className="phone-status" aria-hidden="true">
            <span>{state ? istTime(state.clock) : ""}</span>
            <span>4G</span>
          </div>
        )}
        <div className="phone-head spread">
        <div className="stack" style={{ gap: 1 }}>
          {bare ? <h1 className="phone-name">{view.driver.name}</h1> : <strong className="phone-name">{view.driver.name}</strong>}
          <span>
            <StatusPill status={view.driver.status} lang={lang} />
          </span>
        </div>
          <div className="lang-toggle" role="group" aria-label="Language">
            <button aria-pressed={lang === "en"} onClick={() => run(() => api.language(id, "en"))}>
              EN
            </button>
            <button aria-pressed={lang === "hi"} onClick={() => run(() => api.language(id, "hi"))} lang="hi" aria-label="हिंदी">
              हिं
            </button>
          </div>
        </div>
      </div>

      <div className="phone-body" {...tabs.panel} tabIndex={-1}>
        {tab === "inbox" && <Inbox view={view} onOpen={openLink} />}
        {tab === "kyc" && <Kyc view={view} focus={focus} />}
        {tab === "loads" && <Loads view={view} phone={phoneRef} onGoKyc={() => go("kyc")} />}
      </div>

      <nav className="tabbar" role="tablist" aria-label="App sections" ref={barRef}>
        <button {...tabs.tab("inbox")} onClick={() => go("inbox")}>
          <Bell size={19} aria-hidden="true" />
          {t(lang, "tabInbox")}
          {unread > 0 && (
            <span className="badge-dot">
              <span aria-hidden="true">{unread}</span>
              <span className="sr-only">
                , {unread} {t(lang, "unread")}
              </span>
            </span>
          )}
        </button>
        <button {...tabs.tab("kyc")} onClick={() => go("kyc")}>
          <IdCard size={19} aria-hidden="true" />
          {t(lang, "tabKyc")}
        </button>
        <button {...tabs.tab("loads")} onClick={() => go("loads")}>
          <TruckIcon size={19} aria-hidden="true" />
          {t(lang, "tabLoads")}
        </button>
      </nav>
    </div>
  );
}
