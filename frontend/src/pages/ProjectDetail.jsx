import { useParams } from "react-router-dom";

export default function ProjectDetail() {
  const { id } = useParams();
  return (
    <div>
      <h2>Project Detail</h2>
      <p className="muted">
        Project <code>{id}</code> — info, members, kanban tasks, files,
        check-result history, AI insights.
      </p>
    </div>
  );
}
