export function ConfidenceDots({ value }: { value?: number }) {
  return (
    <div className="flex items-center gap-1" aria-label={`Confidence ${value ?? 0} of 5`}>
      {Array.from({ length: 5 }).map((_, index) => {
        const active = value ? index < value : false;
        return (
          <span
            key={index}
            className={`h-2.5 w-2.5 rounded-full ${
              active ? "bg-spruce" : "bg-slate-200"
            }`}
          />
        );
      })}
    </div>
  );
}
