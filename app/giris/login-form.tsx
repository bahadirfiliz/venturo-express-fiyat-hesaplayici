"use client";

import { useState } from "react";

export default function LoginForm({ next }: { next: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password, next }),
      });
      const data = (await response.json()) as { error?: string; redirectTo?: string };
      if (!response.ok || !data.redirectTo) {
        throw new Error(data.error || "Giriş yapılamadı.");
      }
      window.location.assign(data.redirectTo);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Giriş yapılamadı.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-shell">
        <div className="auth-brand-panel">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/venturo-logo.png" alt="Venturo Express" />
          <div>
            <span>Müşteri Portalı</span>
            <h1>Gönderilerinizi ve proformanızı tek yerde takip edin.</h1>
            <p>
              Kurye fiyatını önceden görün, tamamlanan işlerinizi inceleyin ve
              aylık proformanızı güvenle görüntüleyin.
            </p>
          </div>
          <ul>
            <li>Firma bazlı güvenli erişim</li>
            <li>Anlık kurye fiyatı</li>
            <li>Salt okunur iş ve proforma arşivi</li>
          </ul>
        </div>
        <form className="auth-form-panel" onSubmit={submit}>
          <div className="auth-form-heading">
            <span>Güvenli giriş</span>
            <h2>Hesabınıza giriş yapın</h2>
            <p>Size tanımlanan kullanıcı adı ve şifreyi kullanın.</p>
          </div>
          <label>
            <span>Kullanıcı adı</span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="kullanici.adi"
              required
              autoFocus
            />
          </label>
          <label>
            <span>Şifre</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="••••••••••••"
              required
            />
          </label>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? "Giriş yapılıyor…" : "Giriş yap"}
          </button>
          <small>Oturumunuz yalnızca yetkili olduğunuz firma verilerine erişir.</small>
        </form>
      </section>
    </main>
  );
}
