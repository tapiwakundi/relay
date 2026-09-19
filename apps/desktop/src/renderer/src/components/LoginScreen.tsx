import { useState } from "react";
import logo from "../assets/logo.png";
import { GoogleG } from "./Icons";
import { signInEmail, signInGoogle, signUpEmail } from "../lib/auth";

export function LoginScreen() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">(
    new URLSearchParams(window.location.search).get("invite") ? "signup" : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const invited = Boolean(
    new URLSearchParams(window.location.search).get("invite") || sessionStorage.getItem("relay-invite"),
  );

  async function google() {
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await signInGoogle();
      if (err) setError(err.message ?? "Google sign-in failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === "signup"
          ? await signUpEmail(name || email.split("@")[0], email, password)
          : await signInEmail(email, password);
      if (result.error) {
        setError(result.error.message ?? "Couldn’t sign in");
        setBusy(false);
        return;
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t sign in");
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <img className="login-logo" src={logo} width={72} height={72} alt="Relay" />
        <h1>{mode === "signup" ? "Create an account" : "Sign in to Relay"}</h1>
        <div className="sub">
          {invited ? "You’ve been invited to a workspace. Use the same email the invite was sent to." : "Email and password, or Google"}
        </div>
        {error ? <div className="login-error">{error}</div> : null}
        <button className="btn-google" onClick={google} disabled={busy} type="button">
          <GoogleG />
          Sign in with Google
        </button>
        <div className="or-row">OR</div>
        <form onSubmit={submit} style={{ textAlign: "left" }}>
          {mode === "signup" ? (
            <label className="login-field">
              Display name
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
          ) : null}
          <label className="login-field">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="login-field">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={8}
            />
          </label>
          <button className="btn-demo" disabled={busy} type="submit">
            {mode === "signup" ? "Create account" : "Sign in with email"}
          </button>
        </form>
        <div className="login-switch">
          {mode === "signin" ? (
            <>
              New to Relay?{" "}
              <a
                href="#signup"
                onClick={(ev) => {
                  ev.preventDefault();
                  setMode("signup");
                }}
              >
                Create an account
              </a>
            </>
          ) : (
            <>
              Already using Relay?{" "}
              <a
                href="#signin"
                onClick={(ev) => {
                  ev.preventDefault();
                  setMode("signin");
                }}
              >
                Sign in
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
