import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Cider } from "../api";

export default function AdminCiders() {
  const qc = useQueryClient();
  const { data: ciders, isLoading } = useQuery({ queryKey: ["ciders"], queryFn: api.ciders });

  const create = useMutation({
    mutationFn: api.createCider,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ciders"] }),
  });

  const deleteCider = useMutation({
    mutationFn: api.deleteCider,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ciders"] });
      qc.invalidateQueries({ queryKey: ["entries"] });
    },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => api.updateCider(id, { active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ciders"] });
      qc.invalidateQueries({ queryKey: ["entries"] });
    },
  });

  if (isLoading || !ciders) {
    return (
      <div style={{ padding: "40px 36px", fontFamily: "var(--sans)", color: "var(--ink-3)" }}>
        Loading…
      </div>
    );
  }

  const low      = ciders.filter((c) => c.category === "low");
  const sparkling = ciders.filter((c) => c.category === "sparkling");

  return (
    <div>
      {/* Topbar */}
      <div className="hcc-topbar">
        <div>
          <div className="eyebrow">Operations · Admin</div>
          <h1>Cider List</h1>
          <div className="sub">
            Inactive ciders are <em>hidden from entry grids</em> but history is preserved.
            Deleting permanently removes all entry data.
          </div>
        </div>
      </div>

      <div className="hcc-content">
        <CiderSection
          title="Low ABV"
          category="low"
          ciders={low}
          onAdd={(name) => create.mutate({ name, category: "low" })}
          onToggleActive={(id, active) => toggleActive.mutate({ id, active })}
          onDelete={(id) => deleteCider.mutate(id)}
          adding={create.isPending}
          deleting={deleteCider.isPending ? deleteCider.variables : null}
        />

        <CiderSection
          title="Sparkling"
          category="sparkling"
          ciders={sparkling}
          onAdd={(name) => create.mutate({ name, category: "sparkling" })}
          onToggleActive={(id, active) => toggleActive.mutate({ id, active })}
          onDelete={(id) => deleteCider.mutate(id)}
          adding={create.isPending}
          deleting={deleteCider.isPending ? deleteCider.variables : null}
        />
      </div>
    </div>
  );
}

function CiderSection({
  title,
  ciders,
  onAdd,
  onToggleActive,
  onDelete,
  adding,
  deleting,
}: {
  title: string;
  category: "low" | "sparkling";
  ciders: Cider[];
  onAdd: (name: string) => void;
  onToggleActive: (id: number, active: boolean) => void;
  onDelete: (id: number) => void;
  adding: boolean;
  deleting: number | null;
}) {
  const [newName, setNewName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    onAdd(name);
    setNewName("");
  }

  function handleDelete(cider: Cider) {
    if (confirmDeleteId === cider.id) {
      onDelete(cider.id);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(cider.id);
    }
  }

  return (
    <section className="zone inv">
      {/* Zone header */}
      <header className="zone-head">
        <div className="left">
          <div>
            <div className="zone-tag">Ciders · {title}</div>
            <h2>{title} Varieties</h2>
          </div>
        </div>
        <div style={{ color: "var(--text-3)", fontFamily: "var(--display)", fontStyle: "italic", fontSize: 13 }}>
          {ciders.length} {ciders.length === 1 ? "variety" : "varieties"}
        </div>
      </header>

      {/* Table */}
      <div className="zone-body tight">
        <table className="htable">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Name</th>
              <th style={{ textAlign: "center", width: 100 }}>Status</th>
              <th style={{ width: 200 }}></th>
            </tr>
          </thead>
          <tbody>
            {ciders.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  style={{
                    textAlign: "center",
                    padding: "28px 16px",
                    color: "var(--ink-mute)",
                    fontFamily: "var(--display)",
                    fontStyle: "italic",
                    fontSize: 15,
                  }}
                >
                  No ciders yet — add one below.
                </td>
              </tr>
            )}
            {ciders.map((c) => (
              <tr key={c.id} style={{ opacity: c.active ? 1 : 0.5 }}>
                <td style={{ textAlign: "left" }}>{c.name}</td>
                <td style={{ textAlign: "center" }}>
                  <button
                    className={`hcc-btn sm ${c.active ? "gold" : "ghost"}`}
                    onClick={() => onToggleActive(c.id, !c.active)}
                    style={{ minWidth: 80 }}
                  >
                    {c.active ? "Active" : "Inactive"}
                  </button>
                </td>
                <td style={{ textAlign: "right", padding: "8px 14px" }}>
                  {confirmDeleteId === c.id ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        fontSize: 11,
                        color: "var(--terracotta-deep)",
                        fontFamily: "var(--sans)",
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                      }}>
                        Delete and lose all history?
                      </span>
                      <button
                        className="hcc-btn sm danger"
                        onClick={() => handleDelete(c)}
                        disabled={deleting === c.id}
                      >
                        Yes, delete
                      </button>
                      <button
                        className="hcc-btn sm ghost"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      className="hcc-btn sm ghost"
                      onClick={() => setConfirmDeleteId(c.id)}
                      style={{ color: "var(--ink-3)" }}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Add form */}
        <div style={{
          borderTop: "1px solid var(--rule)",
          padding: "16px 24px",
          background: "var(--cream-deep)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <form onSubmit={handleAdd} style={{ display: "flex", gap: 10, flex: 1, alignItems: "center" }}>
            <span style={{
              fontFamily: "var(--sans)",
              fontSize: 10,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--ink-mute)",
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}>
              ✦ Add
            </span>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={`New variety name…`}
              className="hcc-input"
              style={{ flex: 1 }}
            />
            <button
              type="submit"
              className="hcc-btn primary"
              disabled={adding || !newName.trim()}
            >
              Add Cider
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
