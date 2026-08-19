import React from "react";

interface BrandMarkProps {
  className?: string;
  title?: string;
}

/**
 * Use the 192px app icon rather than the multi-megabyte mark asset — logos
 * render at ~40px, so the heavy PNG only slowed first paint and the service
 * worker cache.
 */
const BrandMark: React.FC<BrandMarkProps> = ({
  className,
  title = "CartLink",
}) => (
  <img
    className={className}
    src="/icon-192.png"
    alt=""
    title={title}
    width={192}
    height={192}
    decoding="async"
    draggable={false}
  />
);

export default BrandMark;
