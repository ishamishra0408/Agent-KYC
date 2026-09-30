import { BrandMark } from "./ui";

// The page's footer (D-047): the project's own links and who built it, after Shadcnblocks' "Footer 7"
// (MIT); none of its code is used. The SIMULATED markers stay where the simulated things are.
const REPO = "https://github.com/ishamishra0408/Agent-KYC";
const LINKS = [
  { label: "Code on GitHub", href: REPO },
  { label: "Decisions", href: `${REPO}/blob/main/DECISIONS.md` },
  { label: "Failures", href: `${REPO}/blob/main/FAILURES.md` },
  { label: "Tests", href: `${REPO}/blob/main/evals/README.md` },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p className="brand">
          <BrandMark size={24} />
          <span>
            Agent <span className="accent">KYC</span>Ready
          </span>
        </p>
        <nav aria-label="Project">
          <ul className="site-footer-links">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} target="_blank" rel="noreferrer">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <p className="small muted">Built by Isha Mishra. MIT License</p>
      </div>
    </footer>
  );
}
