import { useEffect, useRef, useState } from "react";
import { RefreshProvider, readStored, writeStored } from "./data";
import { DemoBar } from "./demo/DemoBar";
import { PhoneApp } from "./driver/PhoneApp";
import { OpsConsole } from "./ops/OpsConsole";
import { AmbientMotes } from "./AmbientMotes";
import { BackgroundPaths } from "./BackgroundPaths";
import { Hero } from "./Hero";
import { Metrics, Pipeline } from "./Results";
import { SiteFooter } from "./SiteFooter";
import { Story } from "./Story";
import { LiquidGlassFilter, Truck } from "./ui";
import { reducedMotion, useTheme } from "./whimsy";

// Three ways in: the side-by-side demo (#/), the driver app alone (#/driver/<id>), the ops console alone (#/ops).
type Route = { name: "demo" } | { name: "driver"; id: string } | { name: "ops" };

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/");
  if (parts[0] === "driver" && parts[1]) return { name: "driver", id: parts[1] };
  if (parts[0] === "ops") return { name: "ops" };
  return { name: "demo" };
}

function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

function DemoPage({ theme, onTheme }: { theme: ReturnType<typeof useTheme>[0]; onTheme: () => void }) {
  const [driverId, setDriverId] = useState(() => readStored("kycready.driver") ?? "c01");
  // The driver picked in the demo bar, for the ops console to follow. Its "Their phone" button changes
  // the phone without moving the console.
  const [follow, setFollow] = useState<{ id: string; seq: number } | undefined>();
  const choose = (id: string) => {
    setDriverId(id);
    writeStored("kycready.driver", id);
  };
  const pick = (id: string) => {
    choose(id);
    setFollow((f) => ({ id, seq: (f?.seq ?? 0) + 1 }));
  };
  const screen = useRef<HTMLDivElement>(null);
  return (
    <div className="demo-page">
      <BackgroundPaths />
      <AmbientMotes />
      <LiquidGlassFilter />
      <Hero onStart={() => screen.current?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth" })} />
      <div className="demo-screen" ref={screen}>
        <DemoBar driverId={driverId} onDriver={pick} theme={theme} onTheme={onTheme} />
        <div className="demo-grid">
          <div className="demo-col">
            <PhoneApp key={driverId} id={driverId} />
          </div>
          <div className="demo-col">
            <OpsConsole onOpenDriver={choose} follow={follow} />
          </div>
        </div>
      </div>
      <Story />
      <Pipeline />
      <Metrics />
      <SiteFooter />
      <div className="road-strip" aria-hidden="true">
        <Truck size={46} className="driving" />
      </div>
    </div>
  );
}

export default function App() {
  const route = useRoute();
  const [theme, toggleTheme] = useTheme();
  return (
    <RefreshProvider>
      {route.name === "driver" ? (
        <PhoneApp key={route.id} id={route.id} bare />
      ) : route.name === "ops" ? (
        <OpsConsole bare />
      ) : (
        <DemoPage theme={theme} onTheme={toggleTheme} />
      )}
    </RefreshProvider>
  );
}
