// Google Drive import (client-side). The in-charge signs into Google, picks
// PDFs in the native Drive Picker, and the browser downloads the bytes and
// feeds them through the SAME upload pipeline as local files (progress, TUS,
// cancel, registration). Uses the non-sensitive drive.file scope: the app can
// only ever read files the user explicitly picked.
//
// The feature is dormant unless both NEXT_PUBLIC_GOOGLE_CLIENT_ID and
// NEXT_PUBLIC_GOOGLE_API_KEY are set (see DEPLOYMENT.md for the setup).

import type { PickedFile } from "./tree";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const FETCH_CONCURRENCY = 3;
// Everything is buffered in browser memory before the upload starts.
const MAX_BATCH_BYTES = 1.5 * 1024 ** 3;

export function driveImportConfigured(): boolean {
  return Boolean(CLIENT_ID && API_KEY);
}

// --- minimal shapes for the Google globals ------------------------------------

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(opts?: { prompt?: string }): void;
}
interface PickerDoc {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
}
interface PickerCallbackData {
  action: string;
  docs?: PickerDoc[];
}
interface DocsView {
  setMimeTypes(mimeTypes: string): DocsView;
  setIncludeFolders(included: boolean): DocsView;
}
interface Picker {
  setVisible(visible: boolean): void;
}
interface PickerBuilder {
  addView(view: DocsView): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setCallback(cb: (data: PickerCallbackData) => void): PickerBuilder;
  enableFeature(feature: string): PickerBuilder;
  setOrigin(origin: string): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  build(): Picker;
}
interface PickerNamespace {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new (viewId?: string) => DocsView;
  ViewId: { DOCS: string };
  Feature: { MULTISELECT_ENABLED: string };
  Action: { PICKED: string; CANCEL: string };
}

declare global {
  interface Window {
    gapi?: { load(lib: string, cb: () => void): void };
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient(cfg: {
            client_id: string;
            scope: string;
            callback: (resp: TokenResponse) => void;
            error_callback?: (err: { type?: string; message?: string }) => void;
          }): TokenClient;
        };
      };
      picker?: PickerNamespace;
    };
  }
}

// --- script + token plumbing ----------------------------------------------------

const scriptPromises = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  const cached = scriptPromises.get(src);
  if (cached) return cached;
  const p = new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      scriptPromises.delete(src);
      reject(new Error("Couldn't load Google scripts — check your connection."));
    };
    document.head.appendChild(el);
  });
  scriptPromises.set(src, p);
  return p;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - Date.now() > 60_000) {
    return cachedToken.value;
  }
  await loadScript("https://accounts.google.com/gsi/client");
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error("Google sign-in failed to load.");

  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: CLIENT_ID!,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(
            new Error(resp.error_description ?? resp.error ?? "Google sign-in was denied."),
          );
          return;
        }
        cachedToken = {
          value: resp.access_token,
          expiresAt: Date.now() + (resp.expires_in ?? 3600) * 1000,
        };
        resolve(resp.access_token);
      },
      error_callback: (err) =>
        reject(new Error(err.message ?? "Google sign-in window was closed.")),
    });
    client.requestAccessToken();
  });
}

async function loadPicker(): Promise<PickerNamespace> {
  await loadScript("https://apis.google.com/js/api.js");
  const gapi = window.gapi;
  if (!gapi) throw new Error("Google API script failed to load.");
  await new Promise<void>((resolve) => gapi.load("picker", resolve));
  const ns = window.google?.picker;
  if (!ns) throw new Error("Google Picker failed to load.");
  return ns;
}

/** Resolves the picked docs, or null if the user closed the dialog. */
function showPicker(ns: PickerNamespace, token: string): Promise<PickerDoc[] | null> {
  return new Promise((resolve) => {
    const view = new ns.DocsView(ns.ViewId.DOCS)
      .setIncludeFolders(true)
      .setMimeTypes("application/pdf");
    const picker = new ns.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(API_KEY!)
      .enableFeature(ns.Feature.MULTISELECT_ENABLED)
      .setOrigin(window.location.origin)
      .setTitle("Pick PDFs to import")
      .setCallback((data) => {
        if (data.action === ns.Action.PICKED) resolve(data.docs ?? []);
        else if (data.action === ns.Action.CANCEL) resolve(null);
      })
      .build();
    picker.setVisible(true);
  });
}

// --- the import ------------------------------------------------------------------

export interface DriveImportResult {
  picked: PickedFile[];
  /** Names of files Drive refused to hand over. */
  failures: string[];
  canceled: boolean;
}

/**
 * Sign in (popup), pick PDFs, download them from Drive in the browser.
 * The result feeds straight into the regular uploader.
 */
export async function importFromDrive(opts?: {
  /** Fires once the user has picked, before downloads begin. */
  onPicked?: (count: number) => void;
}): Promise<DriveImportResult> {
  if (!driveImportConfigured()) {
    throw new Error("Google Drive import isn't configured.");
  }

  const token = await getAccessToken();
  const ns = await loadPicker();
  const docs = await showPicker(ns, token);
  if (docs === null) return { picked: [], failures: [], canceled: true };

  const pdfs = docs.filter((d) => d.mimeType === "application/pdf");
  if (pdfs.length === 0) return { picked: [], failures: [], canceled: false };

  const totalBytes = pdfs.reduce((s, d) => s + (d.sizeBytes ?? 0), 0);
  if (totalBytes > MAX_BATCH_BYTES) {
    throw new Error(
      "That's over 1.5 GB in one batch — please import in a couple of smaller rounds.",
    );
  }

  opts?.onPicked?.(pdfs.length);

  const picked: PickedFile[] = [];
  const failures: string[] = [];
  let cursor = 0;

  const worker = async () => {
    while (cursor < pdfs.length) {
      const doc = pdfs[cursor++];
      try {
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media&supportsAllDrives=true`,
          { headers: { authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error(`Drive returned ${res.status}`);
        const blob = await res.blob();
        const name = doc.name.toLowerCase().endsWith(".pdf") ? doc.name : `${doc.name}.pdf`;
        picked.push({
          relativePath: name,
          file: new File([blob], name, { type: "application/pdf" }),
        });
      } catch {
        failures.push(doc.name);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(FETCH_CONCURRENCY, pdfs.length) }, worker),
  );

  return { picked, failures, canceled: false };
}
