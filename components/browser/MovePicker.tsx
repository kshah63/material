"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { FolderIcon, CheckIcon } from "@/components/icons";
import type { Folder } from "@/lib/types";

interface TreeNode {
  folder: Folder;
  depth: number;
}

function flattenTree(folders: Folder[]): TreeNode[] {
  const byParent = new Map<string | null, Folder[]>();
  for (const f of folders) {
    const key = f.parent_id;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(f);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  const out: TreeNode[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const f of byParent.get(parent) ?? []) {
      out.push({ folder: f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function MovePicker({
  open,
  onClose,
  folders,
  /** When moving a folder: its id + descendants are invalid destinations. */
  disabledIds = new Set(),
  currentParentId,
  title,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  folders: Folder[];
  disabledIds?: Set<string>;
  currentParentId?: string | null;
  title: string;
  onPick: (folderId: string | null) => void;
}) {
  const tree = useMemo(() => flattenTree(folders), [folders]);
  const [selected, setSelected] = useState<string | null | undefined>(undefined);

  const choose = (id: string | null) => setSelected(id);

  const rowStyle = (active: boolean, disabled: boolean): React.CSSProperties => ({
    padding: "9px 10px",
    borderRadius: 9,
    background: active ? "var(--berry-wash)" : "transparent",
    color: disabled ? "var(--ink-faint)" : active ? "var(--berry-deep)" : "var(--ink)",
    boxShadow: active ? "inset 0 0 0 1.5px var(--berry)" : "none",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
  });

  return (
    <Modal open={open} onClose={onClose} title={title} width={460}>
      <div className="scroll-soft" style={{ maxHeight: 340, overflowY: "auto", margin: "-4px -4px 0" }}>
        {/* Course root */}
        <button
          className="flex items-center gap-2.5 w-full text-left"
          style={rowStyle(selected === null, currentParentId === null)}
          disabled={currentParentId === null}
          onClick={() => choose(null)}
        >
          <FolderIcon width={18} height={18} style={{ color: "var(--honey-deep)" }} />
          <span style={{ fontWeight: 800, fontSize: 14 }}>Course root</span>
          {selected === null && <CheckIcon width={16} height={16} style={{ marginLeft: "auto" }} />}
        </button>

        {tree.map(({ folder, depth }) => {
          const disabled = disabledIds.has(folder.id) || currentParentId === folder.id;
          const active = selected === folder.id;
          return (
            <button
              key={folder.id}
              className="flex items-center gap-2.5 w-full text-left"
              style={{ ...rowStyle(active, disabled), paddingLeft: 10 + depth * 18 }}
              disabled={disabled}
              onClick={() => choose(folder.id)}
            >
              <FolderIcon width={18} height={18} style={{ color: "var(--honey)" }} />
              <span className="truncate" style={{ fontWeight: 700, fontSize: 14 }}>
                {folder.name}
              </span>
              {folder.eff_teacher_only && (
                <span className="marker-tag" style={{ marginLeft: 4, fontSize: 9.5, padding: "1px 6px" }}>
                  T-only
                </span>
              )}
              {active && <CheckIcon width={16} height={16} style={{ marginLeft: "auto" }} />}
            </button>
          );
        })}
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          disabled={selected === undefined}
          onClick={() => {
            if (selected !== undefined) {
              onPick(selected);
              onClose();
            }
          }}
        >
          Move here
        </button>
      </div>
    </Modal>
  );
}
