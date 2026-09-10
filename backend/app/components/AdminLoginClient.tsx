"use client";

import { ArrowRight, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { fetchJson } from "./client-request";
import { PasswordField } from "./PasswordField";

export function AdminLoginClient() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { response, data } = await fetchJson("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) throw new Error(data.error || "登录失败");
      window.location.replace("/admin");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录失败");
      setLoading(false);
    }
  }
  return (
    <main className="admin-login-page">
      <section className="admin-login-brand"><ShieldCheck size={28} /><p className="eyebrow">CONTROL ROOM</p><h1>TDE运营台</h1><p>管理用户资料、约期、标签规则和平台通知。</p></section>
      <form className="auth-form" onSubmit={submit}>
        <label className="field" htmlFor="admin-user"><span>超级管理员账号或子管理员手机号</span><input id="admin-user" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
        <PasswordField id="admin-password" label="密码" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        {error ? <p className="form-error">{error}</p> : null}
        <button className="button primary" disabled={loading}>{loading ? "正在连接" : "进入运营台"}<ArrowRight size={18} /></button>
      </form>
    </main>
  );
}
