"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { i, id, init, tx } from "@instantdb/react";

const schema = i.schema({
  entities: {
    accounts: i.entity({
      name: i.string(),
      software: i.number(),
      actual: i.number(),
      createdAt: i.number(),
    }),
  },
});

const APP_ID = process.env.NEXT_PUBLIC_APP_ID || "";
const db = init({ appId: APP_ID, schema });

type Account = {
  id: string;
  name: string;
  software: number;
  actual: number;
  createdAt: number;
};

type Transfer = {
  from: string;
  to: string;
  amount: number;
};

const money = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  minimumFractionDigits: 2,
});

const cardIn = {
  initial: { opacity: 0, y: 18, filter: "blur(8px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
};

function toNum(raw: string) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function settle(accounts: Account[]) {
  const needers = accounts
    .map((a) => ({ name: a.name, amount: +(a.software - a.actual).toFixed(2) }))
    .filter((a) => a.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const payers = accounts
    .map((a) => ({ name: a.name, amount: +((a.actual - a.software).toFixed(2)) }))
    .filter((a) => a.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;

  while (i < payers.length && j < needers.length) {
    const amt = +Math.min(payers[i].amount, needers[j].amount).toFixed(2);
    if (amt > 0) {
      transfers.push({ from: payers[i].name, to: needers[j].name, amount: amt });
      payers[i].amount = +(payers[i].amount - amt).toFixed(2);
      needers[j].amount = +(needers[j].amount - amt).toFixed(2);
    }

    if (payers[i].amount <= 0.0001) i += 1;
    if (needers[j].amount <= 0.0001) j += 1;
  }

  const residualNeed = +needers.reduce((s, n) => s + Math.max(0, n.amount), 0).toFixed(2);
  const residualPay = +payers.reduce((s, n) => s + Math.max(0, n.amount), 0).toFixed(2);

  return { transfers, residualNeed, residualPay };
}

export default function ReconcilePage() {
  const [draft, setDraft] = useState({ name: "", software: "", actual: "" });
  const [open, setOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string>("");

  const { data } = db.useQuery({ accounts: {} });

  const accounts = useMemo(
    () =>
      ((data?.accounts || []) as Account[])
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt),
    [data]
  );

  useEffect(() => {
    if (accounts.length && !highlightId) {
      setHighlightId(accounts[0].id);
    }
  }, [accounts, highlightId]);

  const totals = useMemo(() => {
    const software = accounts.reduce((s, a) => s + a.software, 0);
    const actual = accounts.reduce((s, a) => s + a.actual, 0);
    const gap = +(software - actual).toFixed(2);
    return {
      software,
      actual,
      gap,
      aligned: accounts.filter((a) => Math.abs(a.software - a.actual) < 0.01).length,
    };
  }, [accounts]);

  const settlement = useMemo(() => settle(accounts), [accounts]);

  const addAccount = async () => {
    const name = draft.name.trim();
    if (!name) return;
    const newId = id();
    await db.transact([
      tx.accounts[newId].update({
        name,
        software: toNum(draft.software),
        actual: toNum(draft.actual),
        createdAt: Date.now(),
      }),
    ]);
    setDraft({ name: "", software: "", actual: "" });
    setOpen(false);
    setHighlightId(newId);
  };

  const removeAccount = async (accountId: string) => {
    await db.transact([tx.accounts[accountId].delete()]);
    if (highlightId === accountId) setHighlightId("");
  };

  const updateAmount = async (
    accountId: string,
    key: "software" | "actual",
    raw: string
  ) => {
    await db.transact([tx.accounts[accountId].update({ [key]: toNum(raw) })]);
  };

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8 sm:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_12%,rgba(255,214,153,0.32),transparent_35%),radial-gradient(circle_at_82%_18%,rgba(131,233,210,0.34),transparent_40%),radial-gradient(circle_at_50%_80%,rgba(124,161,255,0.28),transparent_42%),linear-gradient(130deg,#0b111f_0%,#131f3a_45%,#0b1020_100%)]" />
      <div className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full bg-white/10 blur-3xl animate-float-soft" />
      <div className="pointer-events-none absolute bottom-10 -left-24 h-72 w-72 rounded-full bg-cyan-200/20 blur-3xl animate-float-slow" />

      <section className="relative mx-auto w-full max-w-6xl space-y-6">
        <motion.header
          {...cardIn}
          transition={{ duration: 0.45 }}
          className="glass-panel rounded-3xl p-6 sm:p-8"
        >
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-slate-300/80">Balance Intelligence</p>
              <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">高级账户平账控制台</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-200/80">
                自动计算最少转账路径，快速定位偏差账户，并给出外部调平建议。
              </p>
            </div>
            <button
              onClick={() => setOpen(true)}
              className="rounded-2xl border border-white/25 bg-white/12 px-5 py-2.5 text-sm font-medium text-white shadow-[0_8px_30px_rgba(0,0,0,0.25)] transition hover:bg-white/20"
            >
              + 新建账户
            </button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="metric-card">
              <p>账户数量</p>
              <strong>{accounts.length}</strong>
            </div>
            <div className="metric-card">
              <p>软件总额</p>
              <strong>{money.format(totals.software)}</strong>
            </div>
            <div className="metric-card">
              <p>实际总额</p>
              <strong>{money.format(totals.actual)}</strong>
            </div>
            <div className="metric-card">
              <p>已对齐</p>
              <strong>
                {totals.aligned}/{accounts.length || 0}
              </strong>
            </div>
          </div>
        </motion.header>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <motion.section
            {...cardIn}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="glass-panel rounded-3xl p-5 sm:p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">账户明细</h2>
              <span className="text-xs text-slate-300">失焦自动保存</span>
            </div>

            <div className="space-y-3">
              <AnimatePresence>
                {accounts.map((a) => {
                  const delta = +(a.software - a.actual).toFixed(2);
                  const severity = Math.abs(delta);
                  return (
                    <motion.article
                      key={a.id}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className={`rounded-2xl border p-4 transition ${
                        highlightId === a.id
                          ? "border-cyan-200/80 bg-white/16"
                          : "border-white/15 bg-white/8"
                      }`}
                      onMouseEnter={() => setHighlightId(a.id)}
                    >
                      <div className="grid gap-3 sm:grid-cols-[1fr_170px_170px_auto] sm:items-center">
                        <div>
                          <p className="text-sm font-medium text-white">{a.name}</p>
                          <p className="mt-1 text-xs text-slate-300">
                            偏差 {delta > 0 ? "需收" : delta < 0 ? "需付" : "已平"} {money.format(Math.abs(delta))}
                          </p>
                        </div>

                        <label className="field-wrap">
                          <span>软件余额</span>
                          <input
                            defaultValue={a.software}
                            type="number"
                            onBlur={(e) => updateAmount(a.id, "software", e.target.value)}
                            className="field-input"
                          />
                        </label>

                        <label className="field-wrap">
                          <span>实际余额</span>
                          <input
                            defaultValue={a.actual}
                            type="number"
                            onBlur={(e) => updateAmount(a.id, "actual", e.target.value)}
                            className="field-input"
                          />
                        </label>

                        <button
                          onClick={() => removeAccount(a.id)}
                          className="rounded-xl border border-rose-300/40 bg-rose-400/10 px-3 py-2 text-xs font-medium text-rose-100 transition hover:bg-rose-400/20"
                        >
                          删除
                        </button>
                      </div>

                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full rounded-full ${
                            severity < 0.01
                              ? "bg-emerald-300"
                              : severity < 100
                              ? "bg-amber-300"
                              : "bg-rose-300"
                          }`}
                          style={{ width: `${Math.min(100, (severity / 500) * 100)}%` }}
                        />
                      </div>
                    </motion.article>
                  );
                })}
              </AnimatePresence>

              {!accounts.length && (
                <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-8 text-center text-sm text-slate-300">
                  还没有账户，先创建一个。
                </div>
              )}
            </div>
          </motion.section>

          <motion.aside
            {...cardIn}
            transition={{ duration: 0.55, delay: 0.1 }}
            className="glass-panel rounded-3xl p-5 sm:p-6"
          >
            <h2 className="text-lg font-semibold text-white">智能平账建议</h2>
            <p className="mt-2 text-sm text-slate-300">基于净差值计算最少转账次数，优先大额对冲。</p>

            <div className="mt-5 space-y-2">
              {settlement.transfers.length ? (
                settlement.transfers.map((t, idx) => (
                  <div
                    key={`${t.from}-${t.to}-${idx}`}
                    className="rounded-xl border border-white/15 bg-white/8 px-3 py-2 text-sm text-slate-100"
                  >
                    <span className="font-medium">{t.from}</span> 转给 <span className="font-medium">{t.to}</span>
                    <span className="ml-2 text-cyan-200">{money.format(t.amount)}</span>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-emerald-200/30 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100">
                  暂无内部转账需求。
                </div>
              )}
            </div>

            <div className="mt-5 rounded-2xl border border-white/15 bg-black/20 p-4 text-sm text-slate-200">
              <p className="font-medium text-white">外部调平</p>
              <p className="mt-2">
                {settlement.residualNeed > 0 && `需外部补入 ${money.format(settlement.residualNeed)} 才能完全平账。`}
                {settlement.residualPay > 0 && `需外部转出 ${money.format(settlement.residualPay)} 才能完全平账。`}
                {!settlement.residualNeed && !settlement.residualPay && "总账平衡，无需外部调整。"}
              </p>
              <p className="mt-2 text-xs text-slate-400">当前系统总差值：{money.format(totals.gap)}</p>
            </div>
          </motion.aside>
        </div>
      </section>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-[#020617]/70 px-4 backdrop-blur-md"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ type: "spring", bounce: 0.25 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-3xl border border-white/20 bg-[#0f172a]/90 p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-white">创建账户</h3>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-white/20 px-2 py-1 text-xs text-slate-200 hover:bg-white/10"
                >
                  关闭
                </button>
              </div>

              <div className="mt-5 grid gap-3">
                <label className="field-wrap">
                  <span>账户名</span>
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft((s) => ({ ...s, name: e.target.value }))}
                    className="field-input"
                    placeholder="例如：招商银行卡"
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="field-wrap">
                    <span>软件余额</span>
                    <input
                      value={draft.software}
                      onChange={(e) => setDraft((s) => ({ ...s, software: e.target.value }))}
                      type="number"
                      className="field-input"
                      placeholder="0"
                    />
                  </label>

                  <label className="field-wrap">
                    <span>实际余额</span>
                    <input
                      value={draft.actual}
                      onChange={(e) => setDraft((s) => ({ ...s, actual: e.target.value }))}
                      type="number"
                      className="field-input"
                      placeholder="0"
                    />
                  </label>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-white/20 px-4 py-2 text-sm text-slate-200 hover:bg-white/10"
                >
                  取消
                </button>
                <button
                  onClick={addAccount}
                  className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-200"
                >
                  创建并加入
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
