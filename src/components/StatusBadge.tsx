import { LearningBlock } from "@/types/learning-block";

type StatusKind = "not-started" | "learned" | "repeated" | "test-done" | "behind" | "removed";
type SourceKind = "manual" | "generated";
type ItemKind = "learning" | "review";

const statusStyles: Record<StatusKind, string> = {
  "not-started": "border-slate-200 bg-slate-100 text-slate-700",
  learned: "border-emerald-200 bg-emerald-50 text-emerald-700",
  repeated: "border-amber-200 bg-amber-50 text-amber-700",
  "test-done": "border-rose-200 bg-rose-50 text-rose-700",
  behind: "border-red-200 bg-red-50 text-red-700",
  removed: "border-slate-300 bg-slate-100 text-slate-600",
};

const statusLabels: Record<StatusKind, string> = {
  "not-started": "Not started",
  learned: "Learned",
  repeated: "Repeated",
  "test-done": "Test done",
  behind: "Behind schedule",
  removed: "Removed day",
};

const sourceStyles: Record<SourceKind, string> = {
  manual: "border-slate-200 bg-white text-slate-600",
  generated: "border-indigo-200 bg-indigo-50 text-indigo-700",
};

const sourceLabels: Record<SourceKind, string> = {
  manual: "Manual",
  generated: "Auto-generated",
};

const itemStyles: Record<ItemKind, string> = {
  learning: "border-teal-200 bg-teal-50 text-teal-700",
  review: "border-orange-200 bg-orange-50 text-orange-700",
};

const itemLabels: Record<ItemKind, string> = {
  learning: "Learning",
  review: "Review",
};

export function StatusBadge({ kind }: { kind: StatusKind }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[kind]}`}
    >
      {statusLabels[kind]}
    </span>
  );
}

export function SourceBadge({ kind }: { kind: SourceKind }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${sourceStyles[kind]}`}
    >
      {sourceLabels[kind]}
    </span>
  );
}

export function ItemBadge({ kind }: { kind: ItemKind }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${itemStyles[kind]}`}
    >
      {itemLabels[kind]}
    </span>
  );
}

export function BlockBadges({ block }: { block: LearningBlock }) {
  const hasProgress = block.learned || block.repeated || block.testDone;

  return (
    <div className="flex flex-wrap gap-1.5">
      <SourceBadge kind={block.isGenerated ? "generated" : "manual"} />
      <ItemBadge kind={block.itemType === "review" ? "review" : "learning"} />
      {!hasProgress && <StatusBadge kind="not-started" />}
      {block.learned && <StatusBadge kind="learned" />}
      {block.repeated && <StatusBadge kind="repeated" />}
      {block.testDone && <StatusBadge kind="test-done" />}
    </div>
  );
}
