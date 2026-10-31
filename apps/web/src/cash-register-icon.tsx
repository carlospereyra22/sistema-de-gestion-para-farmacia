import { forwardRef, type SVGProps } from "react";

export const CashRegisterIcon = forwardRef<
  SVGSVGElement,
  SVGProps<SVGSVGElement> & { size?: number | string }
>(function CashRegisterIcon({ size = 24, ...props }, ref) {
  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="7" y="2.5" width="10" height="5" rx="1" />
      <path d="M10 5h4M7 7.5 4 14h16l-3-6.5M9 10.5h1m4 0h1" />
      <rect x="3" y="14" width="18" height="7" rx="2" />
      <path d="M10 17.5h4M6 21v1m12-1v1" />
    </svg>
  );
});
