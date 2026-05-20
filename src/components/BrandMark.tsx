import React from "react";

interface BrandMarkProps {
  className?: string;
  title?: string;
}

const BrandMark: React.FC<BrandMarkProps> = ({ className, title = "CartLink" }) => (
  <img
    className={className}
    src="/cartlink-mark.png"
    alt={title}
  />
);

export default BrandMark;
