import { useState } from "react";
import { Link } from "react-router-dom";
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

  if (isLoading || !ciders) return <p>Loading…</p>;

  const low = ciders.filter((c) => c.category === "low");
  const sparkling = ciders.filter((c) => c.category === "sparkling");

  return (
    <div className="space-y-8">
      <div>
        <Link to="/" className="text-sm text-stone-500 hover:underline">← Home</Link>
        <h1 className="text-2xl font-semibold mt-1">Admin — Ciders</h1>
        <p className="text-sm text-stone-500 mt-1">
          Inactive ciders are hidden from entry grids but their historical data is preserved.
          Deleting a cider permanently removes it and all its entry history.
        </p>
      </div>

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
  );
}

function CiderSection({
  title,
  category,
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
    <section className="bg-white border border-stone-200 rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-stone-200 bg-stone-50">
        <h2 className="font-medium">{title}</h2>
      </header>

      <table className="w-full text-sm">
        <thead className="bg-stone-50 text-stone-600 text-xs uppercase border-b border-stone-200">
          <tr>
            <th className="text-left px-4 py-2">Name</th>
            <th className="text-center px-4 py-2 w-28">Active</th>
            <th className="px-4 py-2 w-36"></th>
          </tr>
        </thead>
        <tbody>
          {ciders.map((c) => (
            <tr key={c.id} className={`border-t border-stone-100 ${!c.active ? "opacity-50" : ""}`}>
              <td className="px-4 py-2 font-medium">{c.name}</td>
              <td className="px-4 py-2 text-center">
                <button
                  onClick={() => onToggleActive(c.id, !c.active)}
                  className={`px-2 py-0.5 rounded text-xs font-medium ${
                    c.active
                      ? "bg-green-100 text-green-700 hover:bg-green-200"
                      : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                  }`}
                >
                  {c.active ? "Active" : "Inactive"}
                </button>
              </td>
              <td className="px-4 py-2 text-right">
                {confirmDeleteId === c.id ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="text-xs text-red-600">Delete and lose all history?</span>
                    <button
                      onClick={() => handleDelete(c)}
                      disabled={deleting === c.id}
                      className="px-2 py-0.5 rounded text-xs bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Yes, delete
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2 py-0.5 rounded text-xs border border-stone-300 hover:bg-stone-100"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(c.id)}
                    className="px-2 py-0.5 rounded text-xs border border-stone-200 text-stone-500 hover:border-red-300 hover:text-red-600"
                  >
                    Delete
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border-t border-stone-200 px-4 py-3 bg-stone-50">
        <form onSubmit={handleAdd} className="flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={`Add ${title} cider…`}
            className="flex-1 px-3 py-1.5 rounded border border-stone-300 text-sm focus:border-stone-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={adding || !newName.trim()}
            className="px-4 py-1.5 rounded bg-stone-900 text-white text-sm hover:bg-stone-800 disabled:opacity-50"
          >
            Add
          </button>
        </form>
      </div>
    </section>
  );
}
