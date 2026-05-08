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
  Brain,
  FlameKindling,
  Lock,
  LogOut,
  PenLine,
  Puzzle,
  Tag,
  Undo2,
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
  getFirmSettings,
  getMyContributions,
  listUsers,
  logout,
  updateAiKey,
  updateAiProvider,
  updateModule,
  updateUserRole,
  withdrawContribution,
} from "../api";
import { useUser } from "../contexts/UserContext";
import styles from "./Settings.module.css";

// --- tab definitions -------------------------------------------------------

const TABS = [
  { key: "account",  label: "My Account" },
  { key: "memory",   label: "My Memory" },
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

      <TabPanel active={tab === "memory"}>
        <MemoryTab />
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
  { key: "anthropic", label: "Anthropic", sub: "Claude — default provider" },
  { key: "openai",    label: "OpenAI",    sub: "GPT-4o" },
];

function AiSettingsTab() {
  const [provider,    setProvider]    = useState("anthropic");
  const [hasKey,      setHasKey]      = useState(false);
  const [apiKey,      setApiKey]      = useState("");
  const [loadError,   setLoadError]   = useState(null);
  const [provMsg,     setProvMsg]     = useState(null); // { text, ok }
  const [keyMsg,      setKeyMsg]      = useState(null);
  const [savingProv,  setSavingProv]  = useState(false);
  const [savingKey,   setSavingKey]   = useState(false);

  // Load current settings on mount
  useEffect(() => {
    let cancelled = false;
    getFirmSettings()
      .then((s) => {
        if (cancelled) return;
        setProvider(s.ai_provider || "anthropic");
        setHasKey(s.has_custom_key);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err?.response?.data?.detail ?? "Could not load AI settings.");
      });
    return () => { cancelled = true; };
  }, []);

  const handleProviderSave = async () => {
    setSavingProv(true);
    setProvMsg(null);
    try {
      const updated = await updateAiProvider(provider);
      setProvider(updated.ai_provider);
      setProvMsg({ text: "Provider updated.", ok: true });
    } catch (err) {
      setProvMsg({ text: err?.response?.data?.detail ?? "Save failed.", ok: false });
    } finally {
      setSavingProv(false);
    }
  };

  const handleKeySave = async () => {
    setSavingKey(true);
    setKeyMsg(null);
    try {
      const updated = await updateAiKey(apiKey);
      setHasKey(updated.has_custom_key);
      setApiKey("");
      setKeyMsg({
        text: apiKey ? "Key stored and encrypted." : "Custom key cleared — using env var.",
        ok: true,
      });
    } catch (err) {
      setKeyMsg({ text: err?.response?.data?.detail ?? "Save failed.", ok: false });
    } finally {
      setSavingKey(false);
    }
  };

  return (
    <div className={styles.tabPanel}>
      {loadError && (
        <Card padding="lg">
          <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>
            {loadError}
          </p>
        </Card>
      )}

      {/* Provider selector */}
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
          <div className={styles.formActions}>
            <Button
              variant="primary"
              size="sm"
              onClick={handleProviderSave}
              disabled={savingProv}
            >
              {savingProv ? "Saving…" : "Save provider"}
            </Button>
            {provMsg && (
              <span className={`${styles.saveMsg} ${provMsg.ok ? styles.ok : styles.err}`}>
                {provMsg.text}
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* API key */}
      <Card padding="lg">
        <CardHeader
          title="API key"
          subtitle="Per-firm key stored encrypted (Fernet). Leave blank to use the server's env var."
        />
        <div className={styles.section}>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel} htmlFor="ai-key">
              {hasKey ? "Replace stored key" : "API key"}
            </label>
            <input
              id="ai-key"
              type="password"
              className={styles.fieldInput}
              placeholder={
                hasKey
                  ? "••••••••  (stored — enter new value to replace)"
                  : "sk-ant-…  or  sk-…  (leave blank to use env var)"
              }
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
            <span className={styles.fieldHint}>
              Supports <code>ANTHROPIC_API_KEY</code> and <code>OPENAI_API_KEY</code> formats.
              Save with an empty field to clear the stored key and revert to the env var.
            </span>
          </div>
          <div className={styles.formActions}>
            <Button
              variant="primary"
              size="sm"
              onClick={handleKeySave}
              disabled={savingKey}
            >
              {savingKey
                ? "Saving…"
                : apiKey
                ? "Store key"
                : hasKey
                ? "Clear stored key"
                : "Save"}
            </Button>
            {hasKey && !apiKey && (
              <span className={`${styles.saveMsg} ${styles.ok}`}>
                Custom key active
              </span>
            )}
            {keyMsg && (
              <span className={`${styles.saveMsg} ${keyMsg.ok ? styles.ok : styles.err}`}>
                {keyMsg.text}
              </span>
            )}
          </div>
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

// --- My Memory tab ---------------------------------------------------------

function MemoryTab() {
  const [contributions, setContributions] = useState(null); // null = loading
  const [error,         setError]         = useState(null);
  const [withdrawing,   setWithdrawing]   = useState({});   // { [id]: bool }
  const [withdrawErrs,  setWithdrawErrs]  = useState({});   // { [id]: string }

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getMyContributions();
      setContributions(data);
    } catch (err) {
      setError(err?.response?.data?.detail ?? "Could not load contributions.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleWithdraw = async (chunkId) => {
    setWithdrawing((w) => ({ ...w, [chunkId]: true }));
    setWithdrawErrs((e) => ({ ...e, [chunkId]: null }));
    try {
      await withdrawContribution(chunkId);
      // Optimistically mark as withdrawn
      setContributions((prev) =>
        prev.map((c) => (c.id === chunkId ? { ...c, is_active: false } : c))
      );
    } catch (err) {
      setWithdrawErrs((e) => ({
        ...e,
        [chunkId]: err?.response?.data?.detail ?? "Withdraw failed.",
      }));
    } finally {
      setWithdrawing((w) => ({ ...w, [chunkId]: false }));
    }
  };

  const activeCount   = (contributions ?? []).filter((c) => c.is_active).length;
  const totalCount    = (contributions ?? []).length;

  return (
    <div className={styles.tabPanel}>
      {/* Explainer */}
      <Card padding="lg">
        <CardHeader
          title="Firm memory contributions"
          subtitle="Messages you've shared anonymously to the firm knowledge pool. You can withdraw any contribution at any time."
        />
        <div className={styles.memoryMeta}>
          <Brain size={16} className={styles.memoryMetaIcon} />
          <span>
            {contributions === null
              ? "Loading…"
              : `${activeCount} active · ${totalCount - activeCount} withdrawn`}
          </span>
        </div>
      </Card>

      {/* List */}
      <Card padding="lg">
        {error && (
          <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>
        )}

        {contributions === null && !error && <SkeletonGroup count={3} />}

        {contributions !== null && contributions.length === 0 && (
          <div className={styles.memoryEmpty}>
            <Brain size={28} strokeWidth={1.5} style={{ opacity: 0.35 }} />
            <p>You haven't shared any messages yet.</p>
            <p style={{ fontSize: "var(--text-xs)" }}>
              Use the toggle at the bottom of the chat panel to contribute an AI response to your firm's knowledge pool.
            </p>
          </div>
        )}

        {contributions !== null && contributions.length > 0 && (
          <ul className={styles.contribList}>
            {contributions.map((c) => {
              const isBusy = withdrawing[c.id];
              const wErr   = withdrawErrs[c.id];

              return (
                <li key={c.id} className={styles.contribRow}>
                  <div className={styles.contribBody}>
                    <p className={styles.contribPreview}>{c.anonymized_preview}</p>
                    <div className={styles.contribMeta}>
                      <span className={styles.contribCategory}>
                        {c.category}
                      </span>
                      {c.tags.map((t) => (
                        <span key={t} className={styles.contribTag}>
                          <Tag size={9} />
                          {t}
                        </span>
                      ))}
                      <span className={styles.contribDate}>
                        {new Date(c.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {wErr && (
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--color-danger)" }}>
                        {wErr}
                      </span>
                    )}
                  </div>
                  <div className={styles.contribActions}>
                    {c.is_active ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        leadingIcon={<Undo2 size={13} />}
                        onClick={() => handleWithdraw(c.id)}
                        disabled={isBusy}
                      >
                        {isBusy ? "…" : "Withdraw"}
                      </Button>
                    ) : (
                      <span className={styles.contribWithdrawn}>Withdrawn</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
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
