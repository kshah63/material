"use client";

import { useCallback, useRef, useState } from "react";
import { resumableUpload } from "@/lib/upload/resumable";
import { planUpload, type PickedFile } from "@/lib/upload/tree";
import { dedupeName } from "@/lib/format";
import { createFolderTree } from "@/app/actions/folders";
import { registerFile } from "@/app/actions/files";

export type UploadStatus =
  | "pending"
  | "uploading"
  | "done"
  | "error"
  | "canceled";

export interface UploadItem {
  key: string;
  name: string;
  relativeDir: string;
  size: number;
  sent: number;
  status: UploadStatus;
  error?: string;
}

export interface UploaderState {
  items: UploadItem[];
  active: boolean;
  start: (picked: PickedFile[], existingNames: string[]) => Promise<void>;
  cancel: () => void;
  dismiss: () => void;
  retryFailed: () => void;
}

const CONCURRENCY = 4;

export function useUploader(
  courseId: string,
  folderId: string | null,
  onComplete: (summary: {
    done: number;
    failed: number;
    skipped: number;
    canceled: number;
  }) => void,
): UploaderState {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [active, setActive] = useState(false);
  const itemsRef = useRef<Map<string, UploadItem>>(new Map());
  const lastRun = useRef<{ picked: PickedFile[]; existing: string[] } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sync = useCallback(() => {
    setItems(Array.from(itemsRef.current.values()));
  }, []);

  const update = useCallback(
    (key: string, patch: Partial<UploadItem>) => {
      const cur = itemsRef.current.get(key);
      if (!cur) return;
      itemsRef.current.set(key, { ...cur, ...patch });
      sync();
    },
    [sync],
  );

  const run = useCallback(
    async (picked: PickedFile[], existingNames: string[]) => {
      lastRun.current = { picked, existing: existingNames };
      const plan = planUpload(picked);
      const skipped = plan.skippedNonPdf;

      if (plan.files.length === 0) {
        onComplete({ done: 0, failed: 0, skipped, canceled: 0 });
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setActive(true);

      // Build the upload items with keep-both name de-duplication, scoped per
      // destination directory (and against the current folder's existing names
      // for the drop root).
      const takenByDir = new Map<string, Set<string>>();
      takenByDir.set("", new Set(existingNames));

      const planned = plan.files.map((f, i) => {
        const taken = takenByDir.get(f.relativeDir) ?? new Set<string>();
        const name = dedupeName(f.fileName, taken);
        taken.add(name);
        takenByDir.set(f.relativeDir, taken);
        return { ...f, name, key: `${Date.now()}-${i}` };
      });

      itemsRef.current = new Map(
        planned.map((p) => [
          p.key,
          {
            key: p.key,
            name: p.name,
            relativeDir: p.relativeDir,
            size: p.file.size,
            sent: 0,
            status: "pending" as UploadStatus,
          },
        ]),
      );
      sync();

      // 1) Create the folder rows once, get relativeDir -> folder_id.
      let dirMap: Record<string, string> = {};
      if (plan.dirPaths.length > 0) {
        const res = await createFolderTree(courseId, folderId, plan.dirPaths);
        if (!res.ok) {
          planned.forEach((p) =>
            update(p.key, { status: "error", error: res.error }),
          );
          setActive(false);
          onComplete({ done: 0, failed: planned.length, skipped, canceled: 0 });
          return;
        }
        dirMap = res.map;
      }

      // 2) Upload bytes (resumable, concurrent) then register each file.
      let cursor = 0;
      let done = 0;
      let failed = 0;
      let canceled = 0;

      const worker = async () => {
        while (cursor < planned.length) {
          if (controller.signal.aborted) return;
          const p = planned[cursor++];
          const destFolder =
            p.relativeDir === "" ? folderId : (dirMap[p.relativeDir] ?? folderId);
          const fileId = crypto.randomUUID();
          const objectName = `courses/${courseId}/${fileId}.pdf`;

          update(p.key, { status: "uploading" });
          try {
            await resumableUpload({
              file: p.file,
              objectName,
              signal: controller.signal,
              onProgress: (sent) => update(p.key, { sent }),
            });
            const reg = await registerFile({
              id: fileId,
              courseId,
              folderId: destFolder,
              name: p.name,
              storagePath: objectName,
              sizeBytes: p.file.size,
            });
            if (!reg.ok) throw new Error(reg.error);
            update(p.key, { status: "done", sent: p.file.size });
            done++;
          } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") {
              update(p.key, { status: "canceled" });
              canceled++;
            } else {
              update(p.key, {
                status: "error",
                error: err instanceof Error ? err.message : "Upload failed",
              });
              failed++;
            }
          }
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, planned.length) }, worker),
      );

      // Queued files the workers never reached after a cancel.
      if (controller.signal.aborted) {
        itemsRef.current.forEach((item, key) => {
          if (item.status === "pending" || item.status === "uploading") {
            update(key, { status: "canceled" });
            canceled++;
          }
        });
      }

      setActive(false);
      onComplete({ done, failed, skipped, canceled });
    },
    [courseId, folderId, onComplete, sync, update],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const dismiss = useCallback(() => {
    itemsRef.current = new Map();
    setItems([]);
  }, []);

  const retryFailed = useCallback(() => {
    if (lastRun.current) void run(lastRun.current.picked, lastRun.current.existing);
  }, [run]);

  return { items, active, start: run, cancel, dismiss, retryFailed };
}
