import Link from "next/link";
import { BrandLockup } from "@/components/BrandLockup";

export default function HomePage() {
  const tools = [
    {
      href: "/dps",
      index: "01",
      title: "DPS Calculator",
      copy: "Build and compare loadouts against a live target. Tune prayers, potions, and attack styles without leaving the workbench.",
      action: "Open calculator",
      featured: true,
    },
    {
      href: "/best-setup",
      index: "02",
      title: "Best Setup",
      copy: "Find the strongest setup under a GE budget or strictly from the items in your imported bank.",
      action: "Run optimizer",
    },
    {
      href: "/upgrades",
      index: "03",
      title: "Upgrade Advisor",
      copy: "Rank your next upgrades by damage gain, cost efficiency, or the most attainable iron drop.",
      action: "Review upgrades",
    },
    {
      href: "/graph",
      index: "04",
      title: "DPS Graph",
      copy: "Read the difference between setups across defence levels in one filled, comparable view.",
      action: "Compare curves",
    },
  ];

  return (
    <div className="home-page">
      <BrandLockup className="home-brand" />

      <header className="home-hero">
        <div className="home-hero-copy">
          <p className="eyebrow">OSRS combat workbench</p>
          <h1>Sharper combat decisions.</h1>
          <p className="home-intro">
            Whetstone turns your gear, bank, and target data into clear setup recommendations—using
            one consistent combat engine from first comparison to next upgrade.
          </p>
        </div>
        <dl className="home-proof" aria-label="Product capabilities">
          <div>
            <dt>Built for</dt>
            <dd>Mains &amp; irons</dd>
          </div>
          <div>
            <dt>Optimizes</dt>
            <dd>DPS · TTK · value</dd>
          </div>
          <div>
            <dt>Powered by</dt>
            <dd>Wiki combat data</dd>
          </div>
        </dl>
      </header>

      <section aria-labelledby="tools-title">
        <div className="catalog-heading">
          <h2 id="tools-title">Choose your tool</h2>
          <p>Every result stays connected to the same loadouts and target.</p>
        </div>
        <div className="tool-grid">
          {tools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className={`tool-card ${tool.featured ? "tool-card--featured" : ""}`}
            >
              <h3>{tool.title}</h3>
              <span className="tool-index" aria-hidden="true">{tool.index}</span>
              <p>{tool.copy}</p>
              <span className="tool-action">{tool.action}</span>
            </Link>
          ))}
        </div>
      </section>

      <footer className="home-footer">
        <span>Whetstone · Open source OSRS tooling</span>
        <Link href="/settings">Data and preferences</Link>
      </footer>
    </div>
  );
}
