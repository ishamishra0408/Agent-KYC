import { api, type DriverView } from "../api";
import { useAction } from "../data";
import { istTime, t } from "../i18n";
import { ErrorNote, Push, Source } from "../ui";

// Notifications that got past the send gateway, styled as dispatch labels. Each links to its step.
export function Inbox({ view, onOpen }: { view: DriverView; onOpen: (link: string | null) => void }) {
  const lang = view.driver.language;
  const { run, error } = useAction();
  return (
    <div className="list">
      {view.inbox.length === 0 && <div className="empty">{t(lang, "noMessages")}</div>}
      {view.inbox.map((n, i) => (
        <article key={`${n.at}-${i}`} className="label-card">
          <div className="label-top">
            <span>
              {t(lang, "dispatch")} · {istTime(n.at, true, lang)}
            </span>
            <span className="barcode" aria-hidden="true" />
          </div>
          <div className="label-body">
            <div>
              {n.kind === "status_update" ? (
                <Source kind="rules">Status update</Source>
              ) : (
                <Source kind="ai">Nudge writer · templates</Source>
              )}
            </div>
            <div>{n.text}</div>
            {n.deepLink && (
              <div>
                <Push size="sm" onClick={() => onOpen(n.deepLink)}>
                  {t(lang, "open")}
                </Push>
              </div>
            )}
          </div>
        </article>
      ))}
      <button className="btn ghost small" onClick={() => run(() => api.optOut(view.driver.id, !view.driver.optedOut))}>
        {view.driver.optedOut ? t(lang, "remindersOff") : t(lang, "stopReminders")}
      </button>
      <ErrorNote message={error} />
    </div>
  );
}
