/**
 * Files — every registered file across all projects, grouped by project,
 * with a real client-side search that filters by file name.
 *
 * The page only stores file *links* (per the data model — files are
 * registered to BIM360 / ACC / a URL, never uploaded into FirmOS),
 * so each row's primary action is opening the URL in a new tab.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronRight,
  ExternalLink,
  Folder,
  Search,
  X,
} from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  SkeletonGroup,
} from "../components/ui";
import { SourceBadge } from "../components/files/SourceBadge";
import { getProjectFiles, listProjects } from "../api";
import { relativeTime, shortDate } from "../lib/dates";
import styles from "./Files.module.css";

// --- page ------------------------------------------------------------------

export default function Files() {
  const [projects, setProjects] = useState(null);
  const [filesByProject, setFilesByProject] = useState(null);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState({});

  useEffect(() => {
    let cancelled = false;
    listProjects()
      .then((rows) => !cancelled && setProjects(rows))
      .catch(() => !cancelled && setProjects([]));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!projects) return;
    let cancelled = false;
    if (projects.length === 0) {
      setFilesByProject({});
      return;
    }
    Promise.all(
      projects.map((p) =>
        getProjectFiles(p.id)
          .then((files) => [p.id, files])
          .catch(() => [p.id, []])
      )
    ).then((entries) => {
      if (!cancelled) setFilesByProject(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [projects]);

  // Per-project member lookup so we can resolve uploader_id → uploader name.
  const memberByIdByProject = useMemo(() => {
    if (!projects) return {};
    return Object.fromEntries(
      projects.map((p) => [
        p.id,
        Object.fromEntries((p.members ?? []).map((m) => [m.id, m])),
      ])
    );
  }, [projects]);

  // Group + filter. Sections preserve `projects` order (which is whatever
  // the backend returned, currently insertion order).
  const sections = useMemo(() => {
    if (!projects || !filesByProject) return null;
    const q = query.trim().toLowerCase();
    const out = [];
    for (const p of projects) {
      const all = filesByProject[p.id] ?? [];
      const filtered = q
        ? all.filter((f) => f.name.toLowerCase().includes(q))
        : all;
      if (filtered.length === 0) continue;
      out.push({ project: p, files: filtered });
    }
    return out;
  }, [projects, filesByProject, query]);

  // Counts shown beside the search input ("Showing N of M files").
  const totals = useMemo(() => {
    if (!filesByProject) return { matched: 0, total: 0 };
    let total = 0;
    let matched = 0;
    const q = query.trim().toLowerCase();
    for (const list of Object.values(filesByProject)) {
      for (const f of list) {
        total += 1;
        if (!q || f.name.toLowerCase().includes(q)) matched += 1;
      }
    }
    return { matched, total };
  }, [filesByProject, query]);

  const handleToggle = (pid) =>
    setCollapsed((prev) => ({ ...prev, [pid]: !prev[pid] }));

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <label className={styles.searchWrap}>
          <Search size={14} className={styles.searchIcon} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by file name…"
            className={styles.searchInput}
            aria-label="Search files"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className={styles.searchClear}
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </label>
        {totals.total > 0 && (
          <span className={styles.totals}>
            {query
              ? `${totals.matched} of ${totals.total}`
              : `${totals.total} ${totals.total === 1 ? "file" : "files"}`}
          </span>
        )}
      </div>

      <Body
        sections={sections}
        memberByIdByProject={memberByIdByProject}
        collapsed={collapsed}
        onToggle={handleToggle}
        query={query}
      />
    </div>
  );
}

// --- body ------------------------------------------------------------------

function Body({ sections, memberByIdByProject, collapsed, onToggle, query }) {
  if (sections === null) {
    return (
      <Card padding="md">
        <SkeletonGroup count={5} />
      </Card>
    );
  }
  if (sections.length === 0) {
    return (
      <Card padding="none">
        <EmptyState
          icon={Folder}
          title={query ? "No files match" : "No files registered yet"}
          description={
            query
              ? "Try a shorter or different search term."
              : "Files registered against any of your projects (BIM 360, ACC, or uploaded links) will appear here."
          }
        />
      </Card>
    );
  }
  return (
    <div className={styles.sections}>
      {sections.map(({ project, files }) => (
        <ProjectSection
          key={project.id}
          project={project}
          files={files}
          memberById={memberByIdByProject[project.id] ?? {}}
          collapsed={!!collapsed[project.id]}
          onToggle={() => onToggle(project.id)}
        />
      ))}
    </div>
  );
}

// --- collapsible section ---------------------------------------------------

function ProjectSection({ project, files, memberById, collapsed, onToggle }) {
  const navigate = useNavigate();
  const open = !collapsed;
  return (
    <Card padding="none" className={styles.section}>
      <header className={styles.sectionHeader}>
        <button
          type="button"
          onClick={onToggle}
          className={styles.sectionToggle}
          aria-expanded={open}
        >
          <ChevronRight
            size={14}
            className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
          />
          <span className={styles.sectionTitle}>{project.name}</span>
          <Badge status={project.status} dot size="sm">
            {project.status === "on-hold" ? "On hold" : project.status}
          </Badge>
          <span className={styles.sectionCount}>{files.length}</span>
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/project/${project.id}?tab=files`)}
        >
          Open
        </Button>
      </header>
      {open && (
        <ul className={styles.fileList}>
          {files.map((f) => (
            <FileRow
              key={f.id}
              file={f}
              uploader={f.uploaded_by ? memberById[f.uploaded_by] : null}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

// --- file row --------------------------------------------------------------

function FileRow({ file, uploader }) {
  return (
    <li className={styles.fileRow}>
      <SourceBadge source={file.source} />
      <a
        href={file.url}
        target="_blank"
        rel="noreferrer noopener"
        className={styles.fileLink}
        title={file.url}
      >
        <span className={styles.fileName}>{file.name}</span>
        <ExternalLink size={12} className={styles.linkIcon} />
      </a>
      <div className={styles.uploader}>
        {uploader ? (
          <>
            <Avatar
              name={uploader.name}
              email={uploader.email}
              size="sm"
            />
            <span className={styles.uploaderName}>{uploader.name}</span>
          </>
        ) : (
          <span className={styles.uploaderMissing}>—</span>
        )}
      </div>
      <span className={styles.fileTime} title={shortDate(file.created_at)}>
        {file.created_at ? relativeTime(file.created_at) : "—"}
      </span>
    </li>
  );
}
