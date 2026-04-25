import React from "react";
import { Link } from "react-router-dom";
import { PackageOpen } from "lucide-react";

const NotFound: React.FC = () => {
  return (
    <div className="not-found-wrapper">
      <div className="not-found-card">
        <PackageOpen size={56} className="empty-icon" strokeWidth={1} />
        <h1>Page not found</h1>
        <p>That page doesn&apos;t exist (or your share link has expired).</p>
        <Link to="/" className="primary-btn not-found-btn">
          Back to my list
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
