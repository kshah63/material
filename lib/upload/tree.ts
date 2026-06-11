// Client-side capture of a dropped/selected folder tree (§7.1). Both entry
// points reconstruct the same shape before anything uploads.

export interface PickedFile {
  /** Path relative to the drop target, e.g. "Algebra2/Unit1/notes.pdf". */
  relativePath: string;
  file: File;
}

const PDF_MIME = "application/pdf";

export function isPdf(file: File): boolean {
  return (
    file.type === PDF_MIME ||
    (file.type === "" && file.name.toLowerCase().endsWith(".pdf"))
  );
}

/** From an <input type="file" webkitdirectory> / multiple selection. */
export function filesFromInput(fileList: FileList): PickedFile[] {
  return Array.from(fileList).map((file) => ({
    // webkitRelativePath is "Algebra2/Unit1/notes.pdf"; plain multi-select
    // without a directory has an empty relativePath -> just the filename.
    relativePath:
      (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
      file.name,
    file,
  }));
}

/** Recursively read a dropped FileSystemEntry tree (the only way to drag a folder). */
async function readEntry(
  entry: FileSystemEntry,
  prefix = "",
): Promise<PickedFile[]> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) =>
      fileEntry.file(resolve, reject),
    );
    return [{ relativePath: prefix + entry.name, file }];
  }

  const dirReader = (entry as FileSystemDirectoryEntry).createReader();
  // readEntries returns at most 100 entries per call — loop until empty.
  const all: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      dirReader.readEntries(resolve, reject),
    );
    if (batch.length === 0) break;
    all.push(...batch);
  }

  const nested = await Promise.all(
    all.map((e) => readEntry(e, prefix + entry.name + "/")),
  );
  return nested.flat();
}

/** From a drag-and-drop DataTransfer (handles both files and whole folders). */
export async function filesFromDataTransfer(
  dataTransfer: DataTransfer,
): Promise<PickedFile[]> {
  const items = Array.from(dataTransfer.items)
    .filter((i) => i.kind === "file")
    .map((i) => i.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => Boolean(e));

  if (items.length === 0) {
    // Fallback: no entry API — take the flat file list.
    return Array.from(dataTransfer.files).map((file) => ({
      relativePath: file.name,
      file,
    }));
  }

  const nested = await Promise.all(items.map((e) => readEntry(e)));
  return nested.flat();
}

export interface PlannedUpload {
  /** Directory paths that must exist (no filenames), parents before children. */
  dirPaths: string[];
  /** PDFs to upload, with the directory they live in (""= drop target). */
  files: { relativeDir: string; fileName: string; file: File }[];
  skippedNonPdf: number;
}

/** Split a captured selection into the folders to create and the PDFs to upload. */
export function planUpload(picked: PickedFile[]): PlannedUpload {
  const dirPaths = new Set<string>();
  const files: PlannedUpload["files"] = [];
  let skippedNonPdf = 0;

  for (const { relativePath, file } of picked) {
    if (!isPdf(file)) {
      skippedNonPdf++;
      continue;
    }
    const parts = relativePath.split("/").filter(Boolean);
    const fileName = parts[parts.length - 1];
    const dir = parts.slice(0, -1).join("/");
    if (dir) {
      // Register every intermediate directory.
      const segs = dir.split("/");
      for (let i = 1; i <= segs.length; i++) {
        dirPaths.add(segs.slice(0, i).join("/"));
      }
    }
    files.push({ relativeDir: dir, fileName, file });
  }

  return {
    dirPaths: Array.from(dirPaths),
    files,
    skippedNonPdf,
  };
}
