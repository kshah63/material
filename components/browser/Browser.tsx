"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Breadcrumb } from "./Breadcrumb";
import { FolderRow, FileItemRow } from "./Rows";
import { MovePicker } from "./MovePicker";
import { Viewer } from "./Viewer";
import { UploadTray } from "@/components/upload/UploadTray";
import { Menu } from "@/components/ui/Menu";
import { PromptModal } from "@/components/ui/PromptModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { useUploader } from "@/hooks/useUploader";
import { filesFromInput, filesFromDataTransfer } from "@/lib/upload/tree";
import {
  FolderPlusIcon,
  UploadIcon,
  TrashIcon,
  MoveIcon,
  XIcon,
  ChevronDownIcon,
  PdfIcon,
} from "@/components/icons";
import {
  createFolder,
  renameFolder,
  moveFolder,
  softDeleteFolder,
  setFolderTeacherOnly,
} from "@/app/actions/folders";
import {
  renameFile,
  moveFile,
  softDeleteFile,
  setFileTeacherOnly,
} from "@/app/actions/files";
import Link from "next/link";
import type {
  BreadcrumbCrumb,
  CourseCapabilities,
  FileRow,
  Folder,
} from "@/lib/types";

interface BrowserProps {
  courseId: string;
  courseName: string;
  folderId: string | null;
  breadcrumb: BreadcrumbCrumb[];
  folders: Folder[];
  files: FileRow[];
  allFolders: Folder[];
  caps: CourseCapabilities;
}

type SelType = "folder" | "file";
type Target =
  | { kind: "folder"; folder: Folder }
  | { kind: "file"; file: FileRow };

function descendantsOf(folderId: string, all: Folder[]): Set<string> {
  const childrenByParent = new Map<string, Folder[]>();
  for (const f of all) {
    if (!f.parent_id) continue;
    if (!childrenByParent.has(f.parent_id)) childrenByParent.set(f.parent_id, []);
    childrenByParent.get(f.parent_id)!.push(f);
  }
  const out = new Set<string>([folderId]);
  const stack = [folderId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const c of childrenByParent.get(id) ?? []) {
      if (!out.has(c.id)) {
        out.add(c.id);
        stack.push(c.id);
      }
    }
  }
  return out;
}

export function Browser(props: BrowserProps) {
  const { courseId, courseName, folderId, breadcrumb, folders, files, allFolders, caps } = props;
  const router = useRouter();
  const toast = useToast();

  const [sel, setSel] = useState<Map<string, SelType>>(new Map());
  const [viewing, setViewing] = useState<FileRow | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Target | null>(null);
  const [moveTargets, setMoveTargets] = useState<Target[] | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<Target[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  const filesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => router.refresh(), [router]);

  const uploader = useUploader(courseId, folderId, ({ done, failed, skipped }) => {
    refresh();
    const bits: string[] = [];
    if (done) bits.push(`${done} uploaded`);
    if (failed) bits.push(`${failed} failed`);
    if (skipped) bits.push(`${skipped} non-PDF skipped`);
    if (bits.length) toast(bits.join(" · "), failed ? "error" : "success");
  });

  // --- selection -------------------------------------------------------------
  const toggleSel = (id: string, type: SelType) =>
    setSel((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, type);
      return next;
    });
  const clearSel = () => setSel(new Map());
  const selectionActive = sel.size > 0;

  const selectedFolders = useMemo(
    () => folders.filter((f) => sel.get(f.id) === "folder"),
    [folders, sel],
  );
  const selectedFiles = useMemo(
    () => files.filter((f) => sel.get(f.id) === "file"),
    [files, sel],
  );

  // --- mutations -------------------------------------------------------------
  async function run<T extends { ok: boolean; error?: string }>(
    p: Promise<T>,
    successMsg?: string,
  ) {
    const res = await p;
    if (!res.ok) toast(res.error ?? "Something went wrong.", "error");
    else if (successMsg) toast(successMsg);
    refresh();
    return res.ok;
  }

  const onSetTeacherOnly = (t: Target, v: boolean | null) => {
    const label =
      v === true ? "Marked teacher-only" : v === false ? "Made visible to students" : "Set to inherit";
    if (t.kind === "folder") void run(setFolderTeacherOnly(t.folder.id, courseId, v), label);
    else void run(setFileTeacherOnly(t.file.id, courseId, v), label);
  };

  const doRename = async (value: string) => {
    if (!renameTarget) return;
    if (renameTarget.kind === "folder")
      await run(renameFolder(renameTarget.folder.id, courseId, value), "Folder renamed");
    else await run(renameFile(renameTarget.file.id, courseId, value), "File renamed");
  };

  const doMove = async (dest: string | null) => {
    if (!moveTargets) return;
    const results = await Promise.all(
      moveTargets.map((t) =>
        t.kind === "folder"
          ? moveFolder(t.folder.id, courseId, dest)
          : moveFile(t.file.id, courseId, dest),
      ),
    );
    const failed = results.filter((r) => !r.ok);
    if (failed.length) toast(failed[0].error ?? "Move failed", "error");
    else toast(`Moved ${moveTargets.length} item${moveTargets.length === 1 ? "" : "s"}`);
    clearSel();
    refresh();
  };

  const doDelete = async () => {
    if (!deleteTargets) return;
    const results = await Promise.all(
      deleteTargets.map((t) =>
        t.kind === "folder"
          ? softDeleteFolder(t.folder.id, courseId)
          : softDeleteFile(t.file.id, courseId),
      ),
    );
    const failed = results.filter((r) => !r.ok);
    if (failed.length) toast(failed[0].error ?? "Delete failed", "error");
    else
      toast(
        `Moved ${deleteTargets.length} item${deleteTargets.length === 1 ? "" : "s"} to Trash`,
      );
    clearSel();
    refresh();
  };

  // --- uploads ---------------------------------------------------------------
  const existingNames = useMemo(() => files.map((f) => f.name), [files]);

  const startUpload = (picked: ReturnType<typeof filesFromInput>) => {
    if (picked.length === 0) return;
    void uploader.start(picked, existingNames);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (!caps.canManage) return;
    const picked = await filesFromDataTransfer(e.dataTransfer);
    startUpload(picked);
  };

  // move-picker disabled destinations (folder moves can't target self/descendants)
  const moveDisabledIds = useMemo(() => {
    if (!moveTargets) return new Set<string>();
    const ids = new Set<string>();
    for (const t of moveTargets) {
      if (t.kind === "folder")
        descendantsOf(t.folder.id, allFolders).forEach((id) => ids.add(id));
    }
    return ids;
  }, [moveTargets, allFolders]);

  const isEmpty = folders.length === 0 && files.length === 0;

  return (
    <div
      className="relative min-h-dvh"
      onDragEnter={(e) => {
        if (!caps.canManage) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => caps.canManage && e.preventDefault()}
      onDragLeave={() => {
        if (!caps.canManage) return;
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <div style={{ maxWidth: 940, margin: "0 auto", padding: "28px 28px 96px" }}>
        {/* header */}
        <div className="flex items-start justify-between gap-4 mb-2">
          <Breadcrumb courseId={courseId} courseName={courseName} crumbs={breadcrumb} />
          {caps.canManage && (
            <Link
              href={`/courses/${courseId}/trash`}
              className="btn btn-quiet btn-sm shrink-0"
            >
              <TrashIcon width={16} height={16} /> Trash
            </Link>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 mb-5">
          <h1 style={{ fontSize: 30 }}>
            {breadcrumb.length ? breadcrumb[breadcrumb.length - 1].name : "All materials"}
          </h1>

          {caps.canManage && (
            <div className="flex items-center gap-2 shrink-0">
              <button className="btn btn-ghost btn-sm" onClick={() => setNewFolderOpen(true)}>
                <FolderPlusIcon width={17} height={17} /> New folder
              </button>
              <Menu
                align="right"
                trigger={({ toggle }) => (
                  <button className="btn btn-primary btn-sm" onClick={toggle}>
                    <UploadIcon width={17} height={17} /> Upload
                    <ChevronDownIcon width={14} height={14} />
                  </button>
                )}
                items={[
                  {
                    label: "Upload files",
                    icon: <PdfIcon width={17} height={17} />,
                    onSelect: () => filesInputRef.current?.click(),
                  },
                  {
                    label: "Upload a folder",
                    icon: <FolderPlusIcon width={17} height={17} />,
                    onSelect: () => folderInputRef.current?.click(),
                  },
                ]}
              />
            </div>
          )}
        </div>

        {/* hidden upload inputs */}
        <input
          ref={filesInputRef}
          type="file"
          accept="application/pdf"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) startUpload(filesFromInput(e.target.files));
            e.target.value = "";
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          // @ts-expect-error non-standard but widely supported directory attrs
          webkitdirectory=""
          directory=""
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) startUpload(filesFromInput(e.target.files));
            e.target.value = "";
          }}
        />

        {/* list */}
        <div className="card" style={{ padding: 8, overflow: "hidden" }}>
          {isEmpty ? (
            <EmptyState canManage={caps.canManage} onUpload={() => filesInputRef.current?.click()} />
          ) : (
            <div className="flex flex-col">
              {folders.map((folder) => (
                <FolderRow
                  key={folder.id}
                  folder={folder}
                  href={`/courses/${courseId}?folder=${folder.id}`}
                  selected={sel.has(folder.id)}
                  onToggleSelect={() => toggleSel(folder.id, "folder")}
                  selectionActive={selectionActive}
                  caps={caps}
                  onRename={() => setRenameTarget({ kind: "folder", folder })}
                  onMove={() => setMoveTargets([{ kind: "folder", folder }])}
                  onDelete={() => setDeleteTargets([{ kind: "folder", folder }])}
                  onSetTeacherOnly={(v) => onSetTeacherOnly({ kind: "folder", folder }, v)}
                />
              ))}
              {files.map((file) => (
                <FileItemRow
                  key={file.id}
                  file={file}
                  selected={sel.has(file.id)}
                  onToggleSelect={() => toggleSel(file.id, "file")}
                  selectionActive={selectionActive}
                  caps={caps}
                  onOpen={() => setViewing(file)}
                  onRename={() => setRenameTarget({ kind: "file", file })}
                  onMove={() => setMoveTargets([{ kind: "file", file }])}
                  onDelete={() => setDeleteTargets([{ kind: "file", file }])}
                  onSetTeacherOnly={(v) => onSetTeacherOnly({ kind: "file", file }, v)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* selection action bar */}
      {selectionActive && caps.canManage && (
        <div
          className="fixed left-1/2 z-40 card pop flex items-center gap-2"
          style={{
            bottom: 24,
            transform: "translateX(-50%)",
            padding: "8px 8px 8px 16px",
            boxShadow: "var(--shadow-pop)",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 800 }}>
            {sel.size} selected
          </span>
          <span style={{ width: 1, height: 22, background: "var(--line)", margin: "0 4px" }} />
          <button
            className="btn btn-ghost btn-sm"
            onClick={() =>
              setMoveTargets([
                ...selectedFolders.map((folder) => ({ kind: "folder" as const, folder })),
                ...selectedFiles.map((file) => ({ kind: "file" as const, file })),
              ])
            }
          >
            <MoveIcon width={16} height={16} /> Move
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={() =>
              setDeleteTargets([
                ...selectedFolders.map((folder) => ({ kind: "folder" as const, folder })),
                ...selectedFiles.map((file) => ({ kind: "file" as const, file })),
              ])
            }
          >
            <TrashIcon width={16} height={16} /> Delete
          </button>
          <button className="btn btn-quiet btn-sm" onClick={clearSel} aria-label="Clear selection">
            <XIcon width={16} height={16} />
          </button>
        </div>
      )}

      {/* drag overlay */}
      {dragging && caps.canManage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-8"
          style={{ background: "rgba(232,92,106,0.10)" }}
        >
          <div
            className="flex flex-col items-center gap-3 text-center"
            style={{
              border: "2.5px dashed var(--berry)",
              borderRadius: 24,
              background: "var(--surface)",
              padding: "48px 64px",
              boxShadow: "var(--shadow-pop)",
            }}
          >
            <UploadIcon width={36} height={36} style={{ color: "var(--berry)" }} />
            <p style={{ fontSize: 18, fontWeight: 800 }}>Drop to upload</p>
            <p style={{ color: "var(--ink-soft)" }}>
              PDFs and whole folders are welcome. Non-PDFs are skipped.
            </p>
          </div>
        </div>
      )}

      {/* modals + tray + viewer */}
      <PromptModal
        key={`newfolder-${newFolderOpen}`}
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        title="New folder"
        label="Folder name"
        placeholder="e.g. Unit 3 — Quadratics"
        cta="Create"
        onSubmit={async (name) => {
          await run(createFolder(courseId, folderId, name), "Folder created");
        }}
      />

      <PromptModal
        key={
          renameTarget
            ? renameTarget.kind === "folder"
              ? `rn-${renameTarget.folder.id}`
              : `rn-${renameTarget.file.id}`
            : "rn-none"
        }
        open={renameTarget !== null}
        onClose={() => setRenameTarget(null)}
        title="Rename"
        label="New name"
        initial={
          renameTarget?.kind === "folder"
            ? renameTarget.folder.name
            : renameTarget?.kind === "file"
              ? renameTarget.file.name
              : ""
        }
        onSubmit={doRename}
      />

      <MovePicker
        open={moveTargets !== null}
        onClose={() => setMoveTargets(null)}
        folders={allFolders}
        disabledIds={moveDisabledIds}
        currentParentId={folderId}
        title={`Move ${moveTargets?.length ?? 0} item${(moveTargets?.length ?? 0) === 1 ? "" : "s"}`}
        onPick={doMove}
      />

      <ConfirmModal
        open={deleteTargets !== null}
        onClose={() => setDeleteTargets(null)}
        title="Move to Trash?"
        cta="Move to Trash"
        body={
          <>
            {deleteTargets?.some((t) => t.kind === "folder")
              ? "Folders are deleted with everything inside them. "
              : ""}
            Items stay in Trash for 30 days, then are permanently removed. You can
            restore them any time before that.
          </>
        }
        onConfirm={doDelete}
      />

      <UploadTray items={uploader.items} active={uploader.active} onDismiss={uploader.dismiss} />

      {viewing && <Viewer key={viewing.id} file={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function EmptyState({
  canManage,
  onUpload,
}: {
  canManage: boolean;
  onUpload: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center" style={{ padding: "56px 24px" }}>
      <span
        className="grid place-items-center rounded-[16px] mb-4"
        style={{ width: 60, height: 60, background: "var(--paper-2)", color: "var(--ink-faint)" }}
      >
        <FolderPlusIcon width={28} height={28} />
      </span>
      <h3 style={{ fontSize: 19 }}>
        {canManage ? "This folder is empty" : "Nothing here yet"}
      </h3>
      <p style={{ color: "var(--ink-soft)", marginTop: 6, maxWidth: 360 }}>
        {canManage
          ? "Drag a folder or some PDFs anywhere on this page, or upload to get started."
          : "Your teacher hasn’t added materials here yet. Check back soon."}
      </p>
      {canManage && (
        <button className="btn btn-primary mt-5" onClick={onUpload}>
          <UploadIcon width={17} height={17} /> Upload PDFs
        </button>
      )}
    </div>
  );
}
