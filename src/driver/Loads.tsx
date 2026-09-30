import { Lock } from "lucide-react";
import { useState, type RefObject } from "react";
import { api, type DriverView } from "../api";
import { useAction, useData } from "../data";
import { t } from "../i18n";
import { ErrorNote, Push, Sim, Skeleton, Truck } from "../ui";
import { confetti, play } from "../whimsy";

// Behind the bookings lock: the API answers 403 until the rules (or a reviewer) approve.
// Loads are cargo tickets; booking one stamps it.
export function Loads({ view, phone, onGoKyc }: { view: DriverView; phone: RefObject<HTMLDivElement | null>; onGoKyc: () => void }) {
  const id = view.driver.id;
  const lang = view.driver.language;
  const { data } = useData(() => (view.canBook ? api.loads(id) : Promise.resolve(null)), [id, view.canBook]);
  const { run, busy, error } = useAction();
  const [note, setNote] = useState<string | null>(null);

  if (!view.canBook) {
    return (
      <div className="locked">
        <Lock size={24} aria-hidden="true" />
        <strong>{t(lang, view.driver.status === "LICENCE_EXPIRED" ? "expiredTitle" : "lockedTitle")}</strong>
        {view.driver.status === "LICENCE_EXPIRED" && <span className="small">{t(lang, "expiredBody")}</span>}
        <Push size="sm" onClick={onGoKyc}>
          {t(lang, "continueKyc")}
        </Push>
      </div>
    );
  }
  if (!data) return <Skeleton lines={4} />;

  const book = async (loadId: string) => {
    const r = await run(() => api.book(id, loadId));
    if (!r) return;
    play("stamp");
    if (r.firstTrip) {
      setNote(t(lang, "firstTrip"));
      window.setTimeout(() => play("honk"), 180);
      confetti(phone.current);
    }
  };

  return (
    <div className="list">
      <div className="spread">
        <strong style={{ fontFamily: "var(--font-display)", fontSize: 17 }}>{t(lang, "sampleLoads")}</strong>
        <Sim label="Sample loads" />
      </div>
      {note && (
        <div className="banner approved row" role="status" style={{ margin: 0 }}>
          <Truck size={34} className="driving" /> {note}
        </div>
      )}
      {data.loads.map((l) => {
        const booked = data.bookings.some((b) => b.loadId === l.id);
        return (
          <article key={l.id} className="ticket">
            <div className="ticket-main">
              <div className="route">
                <span className="dot" aria-hidden="true" />
                <span>{l.from}</span>
                <span className="line" aria-hidden="true" />
                <span />
                <span className="dot to" aria-hidden="true" />
                <span>{l.to}</span>
              </div>
              <div className="small muted">
                {l.vehicle} · {l.when} · {l.distanceKm} km
              </div>
            </div>
            <div className="ticket-stub">
              <span className="fare">₹{l.fare.toLocaleString("en-IN")}</span>
              {!booked && (
                <Push size="sm" tone="accent" disabled={busy} onClick={() => book(l.id)}>
                  {t(lang, "book")}
                </Push>
              )}
            </div>
            {booked && <span className="stamp">{t(lang, "booked").toUpperCase()}</span>}
          </article>
        );
      })}
      <ErrorNote message={error} />
    </div>
  );
}
