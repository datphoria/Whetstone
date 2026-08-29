import Image from "next/image";

export function BrandLockup({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={`brand-lockup ${compact ? "brand-lockup--compact" : ""} ${className}`.trim()}>
      <Image
        src="/whetstone-logo.svg"
        width={compact ? 34 : 46}
        height={compact ? 30 : 41}
        alt=""
        aria-hidden="true"
        priority
      />
      <span className="brand-word">Whetstone</span>
    </span>
  );
}
