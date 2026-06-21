import { useEffect, useState } from "react";
import { listAdminManagers } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { AdminManager } from "../types";

export interface ManagerFilterOption {
  label: string;
  /** null means "Все" (no manager_id filter sent to the backend). */
  value: number | null;
}

/**
 * Shared admin-only "view as" filter for Dashboard/NotesList: Свои / Все /
 * a specific manager. Returns an empty options list for non-admins, which
 * callers use as the signal to not render the filter UI at all.
 */
export function useManagerFilter() {
  const { manager, isAdmin } = useAuth();
  const [managers, setManagers] = useState<AdminManager[]>([]);
  // "Все" by default — matches today's existing admin behavior (no filter
  // mechanism existed before, and admin already saw every manager's records).
  const [selectedManagerId, setSelectedManagerId] = useState<number | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    listAdminManagers().then(setManagers).catch(() => setManagers([]));
  }, [isAdmin]);

  const options: ManagerFilterOption[] = isAdmin && manager
    ? [
        { label: "Все", value: null },
        { label: "Свои", value: manager.id },
        ...managers
          .filter((m) => m.id !== manager.id)
          .map((m) => ({ label: m.full_name, value: m.id })),
      ]
    : [];

  return { isAdmin, selectedManagerId, setSelectedManagerId, options };
}
