"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SpinnerIcon, MarkerIcon } from "@/components/icons";
import { SchoolSelect } from "@/components/forms/SchoolSelect";
import { GRADES } from "@/lib/options";
import type { AccountRole } from "@/lib/types";

type Mode = "password" | "magic" | "signup";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [grade, setGrade] = useState("");
  const [school, setSchool] = useState("");
  const [country, setCountry] = useState("");
  const [accountRole, setAccountRole] = useState<AccountRole>("student");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "password") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        router.push(next);
        router.refresh();
      } else if (mode === "signup") {
        if (!fullName.trim()) throw new Error("Please enter your name.");
        if (accountRole === "student" && (!grade.trim() || !school.trim())) {
          throw new Error("Please enter your grade and school.");
        }
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            // handle_new_user reads these into the profiles row.
            data: {
              full_name: fullName.trim(),
              account_role: accountRole,
              ...(accountRole === "student"
                ? {
                    grade: grade.trim(),
                    school: school.trim(),
                    ...(country.trim() ? { country: country.trim() } : {}),
                  }
                : {}),
            },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });
        if (error) throw error;
        if (data.session) {
          // Email confirmation is off — straight in (they'll see the
          // waiting-for-approval screen until an admin approves).
          router.push(next);
          router.refresh();
        } else {
          setSent(
            "We sent a confirmation link to verify your email. After that, an admin will approve your account.",
          );
        }
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });
        if (error) throw error;
        setSent("We sent a sign-in link. Open it on this device to continue.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center rise">
        <div
          className="mx-auto grid place-items-center rounded-full mb-4"
          style={{ width: 56, height: 56, background: "var(--marker)" }}
        >
          <MarkerIcon width={26} height={26} style={{ color: "var(--marker-ink)" }} />
        </div>
        <h2 style={{ fontSize: 22 }}>Check your inbox</h2>
        <p style={{ color: "var(--ink-soft)", marginTop: 8 }}>
          <strong>{email}</strong> — {sent}
        </p>
        <button
          className="btn btn-quiet mt-4"
          onClick={() => {
            setSent(null);
            setMode("password");
          }}
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rise">
      <header className="mb-6">
        <h2 style={{ fontSize: 28, marginBottom: 6 }}>
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h2>
        <p style={{ color: "var(--ink-soft)" }}>
          {mode === "signup"
            ? "A few details and you're in — an admin approves new accounts."
            : "Sign in to reach your courses."}
        </p>
      </header>

      {mode === "signup" && (
        <>
          <div className="mb-4">
            <label className="label" htmlFor="fullName">
              Your name
            </label>
            <input
              id="fullName"
              required
              autoComplete="name"
              className="field"
              placeholder="Jordan Lee"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div className="mb-4">
            <span className="label">I&apos;m joining as a…</span>
            <div className="flex gap-2">
              {(["student", "teacher"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setAccountRole(r)}
                  className="flex-1"
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    fontWeight: 800,
                    fontSize: 14,
                    border: `2px solid ${accountRole === r ? "var(--berry)" : "var(--line)"}`,
                    background: accountRole === r ? "var(--berry-wash)" : "transparent",
                    color: accountRole === r ? "var(--berry-deep)" : "var(--ink-soft)",
                    transition: "border-color .12s ease, color .12s ease",
                  }}
                >
                  {r === "student" ? "Student" : "Teacher"}
                </button>
              ))}
            </div>
          </div>

          {accountRole === "student" && (
            <>
              <div className="mb-4">
                <label className="label" htmlFor="grade">
                  Grade
                </label>
                <select
                  id="grade"
                  required
                  className="field"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                >
                  <option value="">Select your grade…</option>
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-4">
                <label className="label" htmlFor="school">
                  School
                </label>
                <SchoolSelect
                  id="school"
                  required
                  value={school}
                  onChange={setSchool}
                  country={country}
                  onCountryChange={setCountry}
                />
              </div>
            </>
          )}
        </>
      )}

      <div className="mb-4">
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          className="field"
          placeholder="you@mathvision.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      {mode !== "magic" && (
        <div className="mb-4">
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            className="field"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      )}

      {error && (
        <p
          className="mb-3"
          style={{ color: "var(--berry-deep)", fontSize: 13.5, fontWeight: 700 }}
          role="alert"
        >
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary w-full justify-center" disabled={busy}>
        {busy ? (
          <SpinnerIcon />
        ) : mode === "password" ? (
          "Sign in"
        ) : mode === "signup" ? (
          "Create account"
        ) : (
          "Email me a sign-in link"
        )}
      </button>

      {mode !== "signup" && (
        <button
          type="button"
          className="btn btn-quiet w-full justify-center mt-2"
          onClick={() => {
            setError(null);
            setMode(mode === "password" ? "magic" : "password");
          }}
        >
          {mode === "password"
            ? "No password? Email me a link instead"
            : "Sign in with a password"}
        </button>
      )}

      <p
        className="text-center mt-4"
        style={{ fontSize: 13.5, color: "var(--ink-soft)", fontWeight: 600 }}
      >
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <button
              type="button"
              className="underline"
              style={{ fontWeight: 800, color: "var(--berry-deep)" }}
              onClick={() => {
                setError(null);
                setMode("password");
              }}
            >
              Sign in
            </button>
          </>
        ) : (
          <>
            New here?{" "}
            <button
              type="button"
              className="underline"
              style={{ fontWeight: 800, color: "var(--berry-deep)" }}
              onClick={() => {
                setError(null);
                setMode("signup");
              }}
            >
              Create an account
            </button>
          </>
        )}
      </p>
    </form>
  );
}
