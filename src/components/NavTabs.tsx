export type ViewKey = "dashboard" | "calendar" | "table" | "add" | "generate";

const tabs: Array<{ key: ViewKey; label: string }> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "calendar", label: "Calendar" },
  { key: "table", label: "Table" },
  { key: "add", label: "Add Block" },
  { key: "generate", label: "Generate Plan" },
];

type NavTabsProps = {
  activeView: ViewKey;
  onChange: (view: ViewKey) => void;
};

export function NavTabs({ activeView, onChange }: NavTabsProps) {
  return (
    <nav className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-white p-2 shadow-soft sm:flex">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
            activeView === tab.key
              ? "bg-ink text-white"
              : "text-slate-600 hover:bg-slate-100 hover:text-ink"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
