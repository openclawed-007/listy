import React from "react";
import type { User } from "firebase/auth";

interface UserAvatarProps {
  user: User | null;
}

/** Profile picture with a graceful initials fallback. */
const UserAvatar: React.FC<UserAvatarProps> = ({ user }) => {
  const [imgFailed, setImgFailed] = React.useState(false);
  const initial = user?.displayName?.[0]?.toUpperCase() ?? "?";

  if (user?.photoURL && !imgFailed) {
    return (
      <img
        src={user.photoURL}
        alt=""
        className="user-avatar"
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
      />
    );
  }

  return <div className="user-avatar user-avatar-initials">{initial}</div>;
};

export default UserAvatar;
