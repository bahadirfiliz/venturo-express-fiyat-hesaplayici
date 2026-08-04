"use client";

import { useState } from "react";

export default function ChangePasswordForm({ displayName }: { displayName: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmation) {
      setError("Yeni şifreler eşleşmiyor.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await response.json()) as { error?: string; redirectTo?: string };
      if (!response.ok || !data.redirectTo) {
        throw new Error(data.error || "Şifre değiştirilemedi.");
      }
      window.location.assign(data.redirectTo);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Şifre değiştirilemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="password-change-card" onSubmit={submit}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/venturo-logo.png" alt="Venturo Express" />
        <span>İlk giriş güvenliği</span>
        <h1>Hoş geldiniz, {displayName}</h1>
        <p>Geçici şifrenizi yalnızca sizin bildiğiniz kalıcı bir şifreyle değiştirin.</p>
        <label>
          <span>Geçici/mevcut şifre</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <label>
          <span>Yeni şifre</span>
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          <span>Yeni şifre tekrar</span>
          <input
            type="password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <small>En az 12 karakter; büyük/küçük harf, rakam ve özel karakter.</small>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? "Kaydediliyor…" : "Şifreyi değiştir ve devam et"}
        </button>
      </form>
    </main>
  );
}
