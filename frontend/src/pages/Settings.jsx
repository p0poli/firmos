import React from "react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { Avatar, Badge, Button, Card, CardHeader, Skeleton } from "../components/ui";
import { logout } from "../api";
import { useCurrentUser } from "../hooks/useCurrentUser";
import styles from "./Settings.module.css";

/**
 * Settings — minimal placeholder for now.
 *
 * Surfaces the current user's identity (so the operator can see who they
 * are signed in as) and the logout action. Will grow with profile edit,
 * theme toggle, API key management, etc.
 */
export default function Settings() {
  const navigate = useNavigate();
  const { user, loading } = useCurrentUser();

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  return (
    <div className={styles.page}>
      <Card padding="lg">
        <CardHeader title="Account" subtitle="Your sign-in identity for FirmOS." />

        <div className={styles.row}>
          <Avatar
            name={user?.name}
            email={user?.email}
            size="lg"
          />
          <div className={styles.identity}>
            {loading ? (
              <>
                <Skeleton width="180px" height={20} />
                <Skeleton width="220px" height={14} />
              </>
            ) : (
              <>
                <div className={styles.nameRow}>
                  <span className={styles.name}>{user?.name ?? "—"}</span>
                  {user?.role && (
                    <Badge
                      variant={user.role === "admin" ? "primary" : "neutral"}
                      size="sm"
                    >
                      {user.role}
                    </Badge>
                  )}
                </div>
                <span className={styles.email}>{user?.email}</span>
              </>
            )}
          </div>
        </div>
      </Card>

      <Card padding="lg">
        <CardHeader
          title="Session"
          subtitle="Sign out of this browser."
          action={
            <Button
              variant="secondary"
              leadingIcon={<LogOut size={16} />}
              onClick={handleLogout}
            >
              Log out
            </Button>
          }
        />
      </Card>

      <Card padding="lg">
        <CardHeader
          title="About"
          subtitle="FirmOS — firm management for architectural practices."
        />
        <dl className={styles.meta}>
          <div className={styles.metaRow}>
            <dt>Version</dt>
            <dd>0.1.0</dd>
          </div>
          <div className={styles.metaRow}>
            <dt>Backend</dt>
            <dd>{process.env.REACT_APP_API_URL || "https://firmos-backend.onrender.com"}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
