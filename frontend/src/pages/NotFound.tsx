import { Link } from "react-router-dom";
import { EmptyState } from "../components/ui";

export default function NotFoundPage() {
  return (
    <EmptyState title="Page not found">
      <Link to="/dashboard" className="text-brand-700 hover:underline">Back to dashboard</Link>
    </EmptyState>
  );
}
