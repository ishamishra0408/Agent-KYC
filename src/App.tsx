import { useEffect, useState } from "react";
import { RefreshProvider, readStored, writeStored } from "./data";
import { DemoBar } from "./demo/DemoBar";
import { PhoneApp } from "./driver/PhoneApp";
import { OpsConsole } from "./ops/OpsConsole";
import { BackgroundPaths } from "./BackgroundPaths";
import { Story } from "./Story";
import { LiquidGlassFilter, Truck } from "./ui";
import { useTheme } from "./whimsy";

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
  const choose = (id: string) => {
    setDriverId(id);
    writeStored("kycready.driver", id);
  };
  return (
    <div className="demo-page">
      <BackgroundPaths />
      <LiquidGlassFilter />
      <div className="demo-screen">
        <DemoBar driverId={driverId} onDriver={choose} theme={theme} onTheme={onTheme} />
        <div className="demo-grid">
          <div className="demo-col">
            <PhoneApp key={driverId} id={driverId} />
          </div>
          <div className="demo-col">
            <OpsConsole onOpenDriver={choose} />
          </div>
        </div>
      </div>
      <Story />
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
