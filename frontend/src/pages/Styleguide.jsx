/**
 * Styleguide — manual visual sanity check for the UI primitives.
 *
 * Mounted at /#/_styleguide while we're building out the dark theme.
 * Will be removed (or guarded behind a dev-only flag) before the redesign
 * ships. Public — no auth required, so we can hit it without logging in
 * to confirm the palette/typography is working.
 */
import React from "react";
import { Plus, Bell, Search, Inbox, FolderOpen } from "lucide-react";
import {
  Avatar,
  AvatarStack,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ProgressBar,
  Skeleton,
  SkeletonGroup,
  StatCard,
} from "../components/ui";

const demoUsers = [
  { name: "Jane Cooper", email: "jane@firmos.dev" },
  { name: "Mike Chen", email: "mike@firmos.dev" },
  { name: "Lina Park", email: "lina@firmos.dev" },
  { name: "Sam Davis", email: "sam@firmos.dev" },
  { name: "Riya Patel", email: "riya@firmos.dev" },
];

const sectionStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  marginBottom: 32,
};

const rowStyle = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
  gap: 16,
};

export default function Styleguide() {
  return (
    <div
      style={{
        padding: 32,
        maxWidth: 1100,
        margin: "0 auto",
        fontFamily: "var(--font-sans)",
      }}
    >
      <h1
        style={{
          fontSize: "var(--text-3xl)",
          marginBottom: 8,
          color: "var(--color-text)",
        }}
      >
        FirmOS — Styleguide
      </h1>
      <p
        style={{
          color: "var(--color-text-secondary)",
          marginBottom: 32,
        }}
      >
        Step 1 deliverable: design tokens + 8 UI primitives. Each primitive
        below should render with the dark theme, Inter font, and tokenised
        colors. Hover the interactive cards to see the lift effect.
      </p>

      {/* --- Buttons --- */}
      <section style={sectionStyle}>
        <h2 style={{ fontSize: "var(--text-xl)" }}>Button</h2>
        <div style={rowStyle}>
          <Button variant="primary">Primary action</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete</Button>
          <Button variant="primary" leadingIcon={<Plus />}>
            New project
          </Button>
          <Button variant="secondary" trailingIcon={<Search />}>
            Search
          </Button>
          <Button variant="icon" aria-label="Notifications">
            <Bell />
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
        </div>
        <div style={rowStyle}>
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </div>
      </section>

      {/* --- Badges --- */}
      <section style={sectionStyle}>
        <h2 style={{ fontSize: "var(--text-xl)" }}>Badge</h2>
        <div style={rowStyle}>
          <Badge status="active" dot>active</Badge>
          <Badge status="on-hold" dot>on-hold</Badge>
          <Badge status="completed" dot>completed</Badge>
          <Badge status="archived" dot>archived</Badge>
        </div>
        <div style={rowStyle}>
          <Badge variant="success">success</Badge>
          <Badge variant="warning">warning</Badge>
          <Badge variant="danger">danger</Badge>
          <Badge variant="primary">primary</Badge>
          <Badge variant="neutral">neutral</Badge>
        </div>
        <div style={rowStyle}>
          <Badge variant="primary" size="sm">sm</Badge>
          <Badge variant="primary" size="md">md</Badge>
        </div>
      </section>

      {/* --- Avatars --- */}
      <section style={sectionStyle}>
        <h2 style={{ fontSize: "var(--text-xl)" }}>Avatar &amp; AvatarStack</h2>
        <div style={rowStyle}>
          {demoUsers.map((u) => (
            <Avatar key={u.email} name={u.name} email={u.email} size="md" />
          ))}
        </div>
        <div style={rowStyle}>
          <Avatar name="Jane Cooper" size="xs" />
          <Avatar name="Jane Cooper" size="sm" />
          <Avatar name="Jane Cooper" size="md" />
          <Avatar name="Jane Cooper" size="lg" />
        </div>
        <div style={rowStyle}>
          <AvatarStack users={demoUsers} max={3} size="md" />
          <AvatarStack users={demoUsers.slice(0, 2)} max={3} size="md" />
          <AvatarStack users={demoUsers} max={4} size="lg" />
        </div>
      </section>

      {/* --- Cards --- */}
      <section style={sectionStyle}>
        <h2 style={{ fontSize: "var(--text-xl)" }}>Card</h2>
        <div style={gridStyle}>
          <Card>
            <CardHeader title="Static card" subtitle="No hover effect" />
            <p style={{ color: "var(--color-text-secondary)" }}>
              Default surface, default padding. Use for content that isn't
              clickable.
            </p>
          </Card>
          <Card interactive>
            <CardHeader
              title="Interactive card"
              subtitle="Hover me"
              action={<Badge status="active" dot>active</Badge>}
            />
            <p style={{ color: "var(--color-text-secondary)" }}>
              Lifts and brightens on hover. Click target is the whole card.
            </p>
          </Card>
          <Card padding="lg">
            <CardHeader title="Larger padding" />
            <p style={{ color: "var(--color-text-secondary)" }}>
              padding="lg" — used when content needs more breathing room.
            </p>
          </Card>
        </div>
      </section>

      {/* --- StatCards --- */}
      <section style={sectionStyle}>
        <h2 style={{ fontSize: "var(--text-xl)" }}>StatCard</h2>
        <div style={gridStyle}>
          <StatCard
            label="Active projects"
            value={5}
            icon={<FolderOpen />}
            trend={{ direction: "up", value: "+2", label: "this quarter" }}
          />
          <StatCard
            label="Tasks done"
            value="84%"
            trend={{ direction: "up", value: "+6%", label: "vs last week" }}
          />
          <StatCard
            label="Overdue"
            value={3}
            trend={{ direction: "up", value: "+1", label: "this week" }}
            trendIntent="negative"
          />
          <StatCard label="Total firms" value="1" />
        </div>
      </section>

      {/* --- Progress --- */}
      <section style={sectionStyle}>
        <h2 style={{ fontSize: "var(--text-xl)" }}>ProgressBar</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ProgressBar value={3} max={11} showLabel />
          <ProgressBar value={9} max={11} intent="success" showLabel />
          <ProgressBar value={2} max={11} intent="warning" showLabel />
          <ProgressBar value={1} max={11} intent="danger" showLabel />
        </div>
      </section>

      {/* --- Skeletons --- */}
      <section style={sectionStyle}>
        <h2 style={{ fontSize: "var(--text-xl)" }}>Skeleton</h2>
        <div style={gridStyle}>
          <Card>
            <CardHeader title="Stat loading" />
            <Skeleton width="60%" height={32} />
            <div style={{ marginTop: 8 }}>
              <Skeleton width="40%" height={12} />
            </div>
          </Card>
          <Card>
            <CardHeader title="List loading" />
            <SkeletonGroup count={4} />
          </Card>
          <Card>
            <CardHeader title="Avatar row loading" />
            <div style={rowStyle}>
              <Skeleton width={28} height={28} radius="50%" />
              <Skeleton width={28} height={28} radius="50%" />
              <Skeleton width={28} height={28} radius="50%" />
            </div>
          </Card>
        </div>
      </section>

      {/* --- EmptyStates --- */}
      <section style={sectionStyle}>
        <h2 style={{ fontSize: "var(--text-xl)" }}>EmptyState</h2>
        <div style={gridStyle}>
          <Card padding="none">
            <EmptyState
              icon={Inbox}
              title="You're all caught up"
              description="No tasks due in the next 7 days."
            />
          </Card>
          <Card padding="none">
            <EmptyState
              icon={FolderOpen}
              title="No projects yet"
              description="Create your first project to populate the portfolio."
              action={
                <Button variant="primary" leadingIcon={<Plus />}>
                  New project
                </Button>
              }
            />
          </Card>
        </div>
      </section>
    </div>
  );
}
