"use client";

import Link from "next/link";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import {
  FolderIcon,
  PdfIcon,
  DotsIcon,
  RenameIcon,
  MoveIcon,
  TrashIcon,
  MarkerIcon,
  EyeIcon,
  CheckIcon,
} from "@/components/icons";
import { formatBytes, relativeTime } from "@/lib/format";
import type { CourseCapabilities, FileRow, Folder } from "@/lib/types";

function SelectBox({
  checked,
  onChange,
  show,
}: {
  checked: boolean;
  onChange: () => void;
  show: boolean;
}) {
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onChange();
      }}
      aria-label={checked ? "Deselect" : "Select"}
      className="grid place-items-center shrink-0 transition-opacity"
      style={{
        width: 22,
        height: 22,
        borderRadius: 7,
        border: `1.8px solid ${checked ? "var(--berry)" : "var(--line-strong)"}`,
        background: checked ? "var(--berry)" : "var(--surface)",
        color: "#fff",
        opacity: show || checked ? 1 : 0,
      }}
    >
      {checked && <CheckIcon width={14} height={14} />}
    </button>
  );
}

function TeacherOnlyMenu(
  caps: CourseCapabilities,
  current: boolean | null,
  onSet: (v: boolean | null) => void,
): (MenuItem | "divider")[] {
  if (!caps.canManage) return [];
  return [
    "divider",
    {
      label: "Mark teacher-only",
      icon: <MarkerIcon width={17} height={17} />,
      onSelect: () => onSet(true),
      disabled: current === true,
    },
    {
      label: "Visible to students",
      icon: <EyeIcon width={17} height={17} />,
      onSelect: () => onSet(false),
      disabled: current === false,
    },
    {
      label: "Inherit from parent",
      icon: <FolderIcon width={17} height={17} />,
      onSelect: () => onSet(null),
      disabled: current === null,
    },
  ];
}

const rowBase: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "11px 12px",
  borderRadius: 12,
  transition: "background .12s ease",
};

export function FolderRow({
  folder,
  href,
  selected,
  onToggleSelect,
  selectionActive,
  caps,
  onRename,
  onMove,
  onDelete,
  onSetTeacherOnly,
}: {
  folder: Folder;
  href: string;
  selected: boolean;
  onToggleSelect: () => void;
  selectionActive: boolean;
  caps: CourseCapabilities;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
  onSetTeacherOnly: (v: boolean | null) => void;
}) {
  const menuItems: (MenuItem | "divider")[] = [
    { label: "Rename", icon: <RenameIcon width={17} height={17} />, onSelect: onRename },
    { label: "Move to…", icon: <MoveIcon width={17} height={17} />, onSelect: onMove },
    ...TeacherOnlyMenu(caps, folder.teacher_only, onSetTeacherOnly),
    "divider",
    { label: "Delete", icon: <TrashIcon width={17} height={17} />, onSelect: onDelete, danger: true },
  ];

  return (
    <div
      className="group hover:bg-[var(--paper-2)]"
      style={{ ...rowBase, background: selected ? "var(--berry-wash)" : "transparent" }}
    >
      {caps.canManage && (
        <SelectBox checked={selected} onChange={onToggleSelect} show={selectionActive} />
      )}
      <Link href={href} className="flex items-center gap-3 min-w-0 flex-1">
        <span
          className="grid place-items-center rounded-[9px] shrink-0"
          style={{ width: 38, height: 38, background: "#fcefd6", color: "var(--honey-deep)" }}
        >
          <FolderIcon width={21} height={21} />
        </span>
        <span className="min-w-0">
          <span
            className={folder.eff_teacher_only ? "marker-name" : ""}
            style={{ fontSize: 15, fontWeight: 800, display: "inline-block", maxWidth: "100%" }}
          >
            <span className="block truncate">{folder.name}</span>
          </span>
          <span className="block" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Folder · updated {relativeTime(folder.created_at)}
          </span>
        </span>
      </Link>

      {folder.eff_teacher_only && <span className="marker-tag hidden sm:inline-flex">Teacher-only</span>}

      {caps.canManage && (
        <Menu
          items={menuItems}
          trigger={({ toggle }) => (
            <button
              className="btn btn-quiet"
              style={{ padding: 7 }}
              onClick={(e) => {
                e.preventDefault();
                toggle();
              }}
              aria-label="Folder actions"
            >
              <DotsIcon />
            </button>
          )}
        />
      )}
    </div>
  );
}

export function FileItemRow({
  file,
  selected,
  onToggleSelect,
  selectionActive,
  caps,
  onOpen,
  onRename,
  onMove,
  onDelete,
  onSetTeacherOnly,
}: {
  file: FileRow;
  selected: boolean;
  onToggleSelect: () => void;
  selectionActive: boolean;
  caps: CourseCapabilities;
  onOpen: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
  onSetTeacherOnly: (v: boolean | null) => void;
}) {
  const menuItems: (MenuItem | "divider")[] = [
    { label: "Open", icon: <EyeIcon width={17} height={17} />, onSelect: onOpen },
    { label: "Rename", icon: <RenameIcon width={17} height={17} />, onSelect: onRename },
    { label: "Move to…", icon: <MoveIcon width={17} height={17} />, onSelect: onMove },
    ...TeacherOnlyMenu(caps, file.teacher_only, onSetTeacherOnly),
    "divider",
    { label: "Delete", icon: <TrashIcon width={17} height={17} />, onSelect: onDelete, danger: true },
  ];

  return (
    <div
      className="group hover:bg-[var(--paper-2)]"
      style={{ ...rowBase, background: selected ? "var(--berry-wash)" : "transparent" }}
    >
      {caps.canManage && (
        <SelectBox checked={selected} onChange={onToggleSelect} show={selectionActive} />
      )}
      <button onClick={onOpen} className="flex items-center gap-3 min-w-0 flex-1 text-left">
        <span
          className="grid place-items-center rounded-[9px] shrink-0"
          style={{ width: 38, height: 38, background: "#fdeadf", color: "var(--berry)" }}
        >
          <PdfIcon width={21} height={21} />
        </span>
        <span className="min-w-0">
          <span
            className={file.eff_teacher_only ? "marker-name" : ""}
            style={{ fontSize: 15, fontWeight: 700, display: "inline-block", maxWidth: "100%" }}
          >
            <span className="block truncate">{file.name}</span>
          </span>
          <span className="block mono" style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
            {formatBytes(file.size_bytes)} · {relativeTime(file.created_at)}
          </span>
        </span>
      </button>

      {file.eff_teacher_only && <span className="marker-tag hidden sm:inline-flex">Teacher-only</span>}

      {caps.canManage && (
        <Menu
          items={menuItems}
          trigger={({ toggle }) => (
            <button className="btn btn-quiet" style={{ padding: 7 }} onClick={toggle} aria-label="File actions">
              <DotsIcon />
            </button>
          )}
        />
      )}
    </div>
  );
}
