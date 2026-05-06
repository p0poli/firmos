/**
 * Settings — four-tab control panel for the Vitruvius platform.
 *
 * Tabs:
 *   My Account  — identity, role badge, sign out (all roles)
 *   AI Settings — provider + API key management (admin only)
 *   Modules     — firm module on/off toggles (admin only)
 *   Team        — user list + role management + invite (admin only)
 *
 * Non-admin users see an "admin only" notice on restricted tabs.
 */
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BotMessageSquare,
  Boxes,
  FlameKindling,
  Lock,
  LogOut,
  PenLine,
  Puzzle,
} from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Skeleton,
  SkeletonGroup,
  Tabs,
  TabPanel,
} from "../components/ui";
import {
  createUser,
  listUsers,
  logout,
  updateModule,
  updateUserRole,
} from "../api";
import { useUser } from "../contexts/UserContext";
import styles from "./Settings.module.css";

// --- tab definitions -------------------------------------------------------

const TABS = [
  { key: "account",  label: "My Account" },
  { key: "ai",       label: "AI Settings" },
  { key: "modules",  label: "Modules" },
  { key: "team",     label: "Team" },
];

// --- module display metadata -----------------------------------------------

const MODULE_META = {
  revit_connect: {
    name: "Revit Connect",
    desc: "Sync models, run compliance checks, and push insights from Revit.",
    icon: <Boxes size={18} strokeWidth={1.75} />,
  },
  regulations_engine: {
    name: "Regulations Engine",
    desc: "Automated building-code cross-referencing against project specs.",
    icon: <PenLine size={18} strokeWidth={1.75} />,
  },
  fire_safety: {
    name: "Fire Safety Checks",
    desc: "Dedicated compliance layer for fire safety regulations and egress paths.",
    icon: <FlameKindling size={18} strokeWidth={1.75} />,
  },
  autocad_connect: {
    name: "AutoCAD Connect",
    desc: "Two-way sync with AutoCAD drawings and layer-based task automation.",
    icon: <Puzzle size={18} strokeWidth={1.75} />,
  },
};

// --- page ------------------------------------------------------------------

export default function Settings() {
  const [tab, setTab] = useState("account");
  const { user, role, modules, isAdmin, loading, refresh } = useUser();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try { await logout(); }
    finally { navigate("/login", { replace: true }); }
  };

  return (
    <div className={styles.page}>
      <div className={styles.tabBar}>
        <Tabs
          tabs={TABS}
          value={tab}
          onChange={setTab}
          ariaLabel="Settings sections"
        />
      </div>

      <TabPanel active={tab === "account"}>
        <AccountTab user={user} role={role} loading={loading} onLogout={handleLogout} />
      </TabPanel>

      <TabPanel active={tab === "ai"}>
        {isAdmin ? <AiSettingsTab /> : <AdminOnly section="AI configuration" />}
      </TabPanel>

      <TabPanel active={tab === "modules"}>
        {isAdmin
          ? <ModulesTab modules={modules} onRefresh={refresh} />
          : <AdminOnly section="Module management" />}
      </TabPanel>

      <TabPanel active={tab === "team"}>
        {isAdmin ? <TeamTab currentUserId={user?.id} /> : <AdminOnly section="Team management" />}
      </TabPanel>
    </div>
  );
}

// --- My Account tab --------------------------------------------------------

function AccountTab({ user, role, loading, onLogout }) {
  const roleBadgeVariant =
    role === "admin" ? "primary"
    : role === "project_manager" ? "warning"
    : "neutral";

  const roleLabel =
    role === "admin" ? "Administrator"
    : role === "project_manager" ? "Project Manager"
    : "Architect";

  return (
    <div className={styles.tabPanel}>
      {/* Identity card */}
      <Card padding="lg">
        <CardHeader title="Your profile" subtitle="Sign-in identity for this firm." />
        <div className={styles.accountRow}>
          <Avatar name={user?.name} email={user?.email} size="lg" />
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
                  <Badge variant={roleBadgeVariant} size="sm">
                    {roleLabel}
                  </Badge>
                </div>
                <span className={styles.email}>{user?.email ?? "—"}</span>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Session */}
      <Card padding="lg">
        <CardHeader
          title="Session"
          subtitle="Sign out of FirmOS on this browser."
          action={
            <Button
              variant="secondary"
              leadingIcon={<LogOut size={16} />}
              onClick={onLogout}
            >
              Sign out
            </Button>
          }
        />
      </Card>

      {/* About */}
      <Card padding="lg">
        <CardHeader
          title="About"
          subtitle="Vitruvius — AI-powered project intelligence for architectural firms."
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

// --- AI Settings tab -------------------------------------------------------

const PROVIDERS = [
  {
    key: "anthropic",
    label: "Anthropic",
    sub: "Claude — default provider",
  },
  {
    key: "openai",
    label: "OpenAI",
    sub: "GPT-4o",
  },
];

function AiSettingsTab() {
  const [provider, setProvider] = useState("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null); // { text, ok }

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      // Placeholder — Step 6 will add these backend endpoints.
      // For now we surface a clear message rather than silently failing.
      await Promise.resolve(); // swap out for real API calls in Step 6
      setMsg({ text: "Settings endpoint not yet deployed — configure via environment variables.", ok: false });
    } catch (err) {
      setMsg({ text: err?.response?.data?.detail ?? "Save failed.", ok: false });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.tabPanel}>
      <Card padding="lg">
        <CardHeader
          title="AI provider"
          subtitle="Choose which provider Vitruvius uses to generate insights and answer questions."
        />

        <div className={styles.section}>
          <div className={styles.providerRow}>
            {PROVIDERS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`${styles.providerCard} ${provider === p.key ? styles.selected : ""}`}
                onClick={() => setProvider(p.key)}
              >
                <BotMessageSquare size={20} strokeWidth={1.75} />
                <div>
                  <div className={styles.providerCardLabel}>{p.label}</div>
                  <div className={styles.providerCardSub}>{p.sub}</div>
                </div>
              </button>
            ))}
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel} htmlFor="ai-key">
              API key
            </label>
            <input
              id="ai-key"
              type="password"
              className={styles.fieldInput}
              placeholder="sk-ant-… or sk-…  (leave blank to use env var)"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
            <span className={styles.fieldHint}>
              The key is encrypted at rest (Fernet). Leave blank to fall back to the
              system-wide env var (<code>ANTHROPIC_API_KEY</code> / <code>OPENAI_API_KEY</code>).
            </span>
          </div>

          <div className={styles.formActions}>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save AI settings"}
            </Button>
            {msg && (
              <span className={`${styles.saveMsg} ${msg.ok ? styles.ok : styles.err}`}>
                {msg.text}
              </span>
            )}
          </div>

          <span className={styles.fieldHint} style={{ marginTop: "var(--space-1)" }}>
            ⚠️ Provider/key management endpoints will be wired in the next backend release.
            Env vars are the recommended approach for production deployments.
          </span>
        </div>
      </Card>
    </div>
  );
}

// --- Modules tab -----------------------------------------------------------

function ModulesTab({ modules, onRefresh }) {
  const [toggling, setToggling] = useState({}); // { [key]: bool }
  const [errors, setErrors]     = useState({}); // { [key]: string }

  const handleToggle = async (moduleKey, currentlyActive) => {
    setToggling((t) => ({ ...t, [moduleKey]: true }));
    setErrors((e) => ({ ...e, [moduleKey]: null }));
    try {
      await updateModule(moduleKey, !currentlyActive);
      await onRefresh(); // re-fetch modules into UserContext
    } catch (err) {
      setErrors((e) => ({
        ...e,
        [moduleKey]: err?.response?.data?.detail ?? "Toggle failed.",
      }));
    } finally {
      setToggling((t) => ({ ...t, [moduleKey]: false }));
    }
  };

  if (!modules || modules.length === 0) {
    return (
      <Card padding="lg">
        <SkeletonGroup count={4} />
      </Card>
    );
  }

  return (
    <div className={styles.tabPanel}>
      <Card padding="lg">
        <CardHeader
          title="Firm modules"
          subtitle="Activate or deactivate optional modules for your entire firm."
        />
        <ul className={styles.moduleList}>
          {modules.map((mod) => {
            const meta = MODULE_META[mod.module_key] ?? {
              name: mod.module_key,
              desc: "",
              icon: <Boxes size={18} />,
            };
            const isOn   = mod.is_active;
            const isBusy = toggling[mod.module_key];
            const err    = errors[mod.module_key];

            return (
              <li key={mod.module_key} className={styles.moduleRow}>
                <span className={styles.moduleIcon} aria-hidden="true">
                  {meta.icon}
                </span>

                <div className={styles.moduleInfo}>
                  <span className={styles.moduleName}>{meta.name}</span>
                  <span className={styles.moduleDesc}>{meta.desc}</span>
                  {err && (
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--color-danger)" }}>
                      {err}
                    </span>
                  )}
                </div>

                <div className={styles.moduleActions}>
                  <Badge
                    variant={isOn ? "success" : "neutral"}
                    size="sm"
                  >
                    {isOn ? "Active" : "Inactive"}
                  </Badge>
                  <Button
                    variant={isOn ? "secondary" : "primary"}
                    size="sm"
                    onClick={() => handleToggle(mod.module_key, isOn)}
                    disabled={isBusy}
                  >
                    {isBusy ? "…" : isOn ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

// --- Team tab --------------------------------------------------------------

const ROLE_OPTIONS = [
  { value: "admin",           label: "Admin" },
  { value: "project_manager", label: "Project Manager" },
  { value: "architect",       label: "Architect" },
];

function TeamTab({ currentUserId }) {
  const [users, setUsers]           = useState(null);
  const [roleUpdating, setRoleUpdating] = useState({});
  const [roleErrors, setRoleErrors] = useState({});
  const [error, setError]           = useState(null);

  // Invite form state
  const [inviteName,  setInviteName]  = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePass,  setInvitePass]  = useState("");
  const [inviteRole,  setInviteRole]  = useState("architect");
  const [inviting,    setInviting]    = useState(false);
  const [inviteMsg,   setInviteMsg]   = useState(null);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await listUsers();
      setUsers(data);
    } catch (err) {
      setError(err?.response?.data?.detail ?? "Could not load team.");
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleRoleChange = async (userId, newRole) => {
    setRoleUpdating((u) => ({ ...u, [userId]: true }));
    setRoleErrors((e)   => ({ ...e, [userId]: null }));
    try {
      const updated = await updateUserRole(userId, newRole);
      setUsers((prev) => prev.map((u) => u.id === userId ? updated : u));
    } catch (err) {
      setRoleErrors((e) => ({
        ...e,
        [userId]: err?.response?.data?.detail ?? "Update failed.",
      }));
    } finally {
      setRoleUpdating((u) => ({ ...u, [userId]: false }));
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviting(true);
    setInviteMsg(null);
    try {
      await createUser({ name: inviteName, email: inviteEmail, password: invitePass, role: inviteRole });
      setInviteMsg({ text: `${inviteName} added to the firm.`, ok: true });
      setInviteName(""); setInviteEmail(""); setInvitePass(""); setInviteRole("architect");
      await fetchUsers();
    } catch (err) {
      setInviteMsg({ text: err?.response?.data?.detail ?? "Invite failed.", ok: false });
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className={styles.tabPanel}>
      {/* Team member list */}
      <Card padding="lg">
        <CardHeader
          title="Team members"
          subtitle="Manage roles for everyone in your firm."
        />
        {error && (
          <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>
        )}
        {users === null && !error ? (
          <SkeletonGroup count={4} />
        ) : (
          <ul className={styles.teamList}>
            {(users ?? []).map((u) => {
              const isSelf = u.id === currentUserId;
              const isUpdating = roleUpdating[u.id];
              const roleErr    = roleErrors[u.id];

              return (
                <li key={u.id} className={styles.teamRow}>
                  <Avatar name={u.name} email={u.email} size="md" />
                  <div className={styles.teamMeta}>
                    <span className={styles.teamName}>
                      {u.name}
                      {isSelf && (
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginLeft: "var(--space-2)" }}>
                          (you)
                        </span>
                      )}
                    </span>
                    <span className={styles.teamEmail}>{u.email}</span>
                    {roleErr && (
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--color-danger)" }}>
                        {roleErr}
                      </span>
                    )}
                  </div>

                  <select
                    className={styles.roleSelect}
                    value={u.role}
                    disabled={isSelf || isUpdating}
                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    aria-label={`Role for ${u.name}`}
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Invite / create user */}
      <Card padding="lg">
        <CardHeader
          title="Add team member"
          subtitle="Create a new account in your firm."
        />
        <form onSubmit={handleInvite}>
          <div className={styles.inviteGrid}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="inv-name">Full name</label>
              <input
                id="inv-name"
                className={styles.fieldInput}
                placeholder="Ada Lovelace"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                required
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="inv-email">Email</label>
              <input
                id="inv-email"
                type="email"
                className={styles.fieldInput}
                placeholder="ada@firm.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="inv-pass">Temporary password</label>
              <input
                id="inv-pass"
                type="password"
                className={styles.fieldInput}
                placeholder="••••••••"
                value={invitePass}
                onChange={(e) => setInvitePass(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="inv-role">Role</label>
              <select
                id="inv-role"
                className={styles.inviteSelect}
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.formActions} style={{ marginTop: "var(--space-4)" }}>
            <Button type="submit" variant="primary" size="sm" disabled={inviting}>
              {inviting ? "Adding…" : "Add team member"}
            </Button>
            {inviteMsg && (
              <span className={`${styles.saveMsg} ${inviteMsg.ok ? styles.ok : styles.err}`}>
                {inviteMsg.text}
              </span>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}

// --- Admin-only notice -----------------------------------------------------

function AdminOnly({ section }) {
  return (
    <Card padding="lg">
      <div className={styles.adminOnly}>
        <span className={styles.adminOnlyIcon}>
          <Lock size={32} strokeWidth={1.5} />
        </span>
        <span className={styles.adminOnlyTitle}>{section} is admin-only</span>
        <span className={styles.adminOnlyDesc}>
          Contact your firm administrator to adjust these settings.
        </span>
      </div>
    </Card>
  );
}
