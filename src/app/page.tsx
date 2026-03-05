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
  fromId: string;
  toId: string;
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

function round2(n: number) {
  return +n.toFixed(2);
}

function settleSoftware(accounts: Account[], compareId: string) {
  const compareAccount = accounts.find((a) => a.id === compareId);
  const working = accounts.filter((a) => a.id !== compareId);

  const suppliers = working
    .map((a) => ({ id: a.id, name: a.name, amount: round2(a.software - a.actual) }))
    .filter((a) => a.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const receivers = working
    .map((a) => ({ id: a.id, name: a.name, amount: round2(a.actual - a.software) }))
    .filter((a) => a.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;

  while (i < suppliers.length && j < receivers.length) {
    const amt = round2(Math.min(suppliers[i].amount, receivers[j].amount));
    if (amt > 0) {
      transfers.push({
        fromId: suppliers[i].id,
        toId: receivers[j].id,
        from: suppliers[i].name,
        to: receivers[j].name,
        amount: amt,
      });
      suppliers[i].amount = round2(suppliers[i].amount - amt);
      receivers[j].amount = round2(receivers[j].amount - amt);
    }
    if (suppliers[i].amount <= 0.0001) i += 1;
    if (receivers[j].amount <= 0.0001) j += 1;
  }

  if (compareAccount) {
    for (const supplier of suppliers) {
      if (supplier.amount > 0.0001) {
        transfers.push({
          fromId: supplier.id,
          toId: compareAccount.id,
          from: supplier.name,
          to: compareAccount.name,
          amount: round2(supplier.amount),
        });
      }
    }

    for (const receiver of receivers) {
      if (receiver.amount > 0.0001) {
        transfers.push({
          fromId: compareAccount.id,
          toId: receiver.id,
          from: compareAccount.name,
          to: receiver.name,
          amount: round2(receiver.amount),
        });
      }
    }
  }

  let compareAfter: number | null = null;
  let compareNeedAfter: number | null = null;
  let compareDelta: number | null = null;

  if (compareAccount) {
    const inToCompare = transfers
      .filter((t) => t.toId === compareAccount.id)
      .reduce((s, t) => s + t.amount, 0);
    const outFromCompare = transfers
      .filter((t) => t.fromId === compareAccount.id)
      .reduce((s, t) => s + t.amount, 0);

    compareAfter = round2(compareAccount.software + inToCompare - outFromCompare);
    compareNeedAfter = round2(compareAccount.actual - compareAfter);
    compareDelta = round2(compareAfter - compareAccount.software);
  }

  return {
    transfers,
    compareAccount,
    compareAfter,
    compareNeedAfter,
    compareDelta,
  };
}

export default function ReconcilePage() {
  const [draft, setDraft] = useState({ name: "", software: "", actual: "" });
  const [open, setOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string>("");
  const [compareId, setCompareId] = useState<string>("");
  const [runningTransfer, setRunningTransfer] = useState<string>("");

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

  useEffect(() => {
    if (!accounts.length) {
      setCompareId("");
      return;
    }
    if (!compareId || !accounts.some((a) => a.id === compareId)) {
      setCompareId(accounts[accounts.length - 1].id);
    }
  }, [accounts, compareId]);

  const orderedAccounts = useMemo(() => {
    if (!compareId) return accounts;
    const pinned = accounts.find((a) => a.id === compareId);
    if (!pinned) return accounts;
    return accounts.filter((a) => a.id !== compareId).concat(pinned);
  }, [accounts, compareId]);

  const totals = useMemo(() => {
    const software = accounts.reduce((s, a) => s + a.software, 0);
    const actual = accounts.reduce((s, a) => s + a.actual, 0);
    const gap = round2(software - actual);
    return {
      software,
      actual,
      gap,
      aligned: accounts.filter((a) => Math.abs(a.software - a.actual) < 0.01).length,
    };
  }, [accounts]);

  const settlement = useMemo(
    () => settleSoftware(accounts, compareId),
    [accounts, compareId]
  );

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

  const executeTransfer = async (transfer: Transfer) => {
    const from = accounts.find((a) => a.id === transfer.fromId);
    const to = accounts.find((a) => a.id === transfer.toId);
    if (!from || !to) return;

    const transferKey = `${transfer.fromId}-${transfer.toId}-${transfer.amount}`;
    setRunningTransfer(transferKey);

    await db.transact([
      tx.accounts[from.id].update({ software: round2(from.software - transfer.amount) }),
      tx.accounts[to.id].update({ software: round2(to.software + transfer.amount) }),
    ]);

    setRunningTransfer("");
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
                算法只调整软件余额，实际余额可随每次对账重新录入。
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

          <div className="mt-4 rounded-2xl border border-white/20 bg-black/20 p-4 text-sm text-slate-100">
            <p className="font-medium text-white">最终比对账户结果</p>
            <p className="mt-2">
              {settlement.compareAccount && settlement.compareDelta !== null && settlement.compareDelta < 0 &&
                `${settlement.compareAccount.name} 需扣除 ${money.format(Math.abs(settlement.compareDelta))}。`}
              {settlement.compareAccount && settlement.compareDelta !== null && settlement.compareDelta > 0 &&
                `${settlement.compareAccount.name} 需收入 ${money.format(settlement.compareDelta)}。`}
              {settlement.compareAccount && settlement.compareDelta === 0 &&
                `${settlement.compareAccount.name} 无需额外收支。`}
              {!settlement.compareAccount && "请先选择一个比对账户。"}
            </p>
            <p className="mt-1 text-xs text-slate-300">
              {settlement.compareAccount && settlement.compareAfter !== null && settlement.compareNeedAfter !== null &&
                `执行建议后：软件余额 ${money.format(settlement.compareAfter)}，平账：${settlement.compareNeedAfter >= 0 ? "+" : ""}${settlement.compareNeedAfter}。`}
            </p>
          </div>
        </motion.header>

        <motion.section
          {...cardIn}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="glass-panel rounded-3xl p-5 sm:p-6"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">账户明细与转账执行</h2>
            <span className="text-xs text-slate-300">设为比对账户后会自动置底</span>
          </div>

          <div className="space-y-3">
            <AnimatePresence>
              {orderedAccounts.map((a) => {
                const reconcileNeed = round2(a.actual - a.software);
                const severity = Math.abs(reconcileNeed);
                const outgoing = settlement.transfers.filter((t) => t.fromId === a.id);
                const incoming = settlement.transfers.filter((t) => t.toId === a.id);

                return (
                  <motion.article
                    layout
                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                    key={a.id}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className={`rounded-3xl border p-5 transition ${
                      highlightId === a.id
                        ? "border-cyan-200/80 bg-white/18"
                        : "border-white/15 bg-white/10"
                    } ${compareId === a.id ? "ring-2 ring-cyan-200/60" : ""}`}
                    onMouseEnter={() => setHighlightId(a.id)}
                  >
                    <div className="grid gap-3 sm:grid-cols-[1fr_190px_190px_88px] sm:items-end">
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-lg font-semibold tracking-wide text-white sm:text-xl">{a.name}</p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setCompareId(a.id)}
                              disabled={compareId === a.id}
                              className={`grid h-8 w-8 place-items-center rounded-full border transition ${
                                compareId === a.id
                                  ? "opacity-0 pointer-events-none"
                                  : "border-cyan-200/55 bg-cyan-300/15 text-cyan-100 hover:bg-cyan-300/30"
                              }`}
                              aria-label={`将${a.name}置底`}
                            >
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M6 10l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                            <button
                              onClick={() => removeAccount(a.id)}
                              className="grid h-8 w-8 place-items-center rounded-full border border-rose-300/55 bg-rose-500/15 text-rose-100 transition hover:bg-rose-500/30"
                              aria-label={`删除${a.name}`}
                            >
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <p className="mt-2 text-sm text-slate-200">平账：{reconcileNeed >= 0 ? "+" : ""}{reconcileNeed}</p>
                      </div>

                      <label className="field-wrap">
                        <span>软件余额</span>
                        <input
                          key={`software-${a.id}-${a.software}`}
                          defaultValue={a.software}
                          type="number"
                          onBlur={(e) => updateAmount(a.id, "software", e.target.value)}
                          className="field-input h-[44px]"
                          placeholder="输入软件余额"
                        />
                      </label>

                      <label className="field-wrap">
                        <span>实际余额</span>
                        <input
                          key={`actual-${a.id}-${a.actual}`}
                          defaultValue={a.actual}
                          type="number"
                          onBlur={(e) => updateAmount(a.id, "actual", e.target.value)}
                          className="field-input h-[44px]"
                          placeholder="输入实际余额"
                        />
                      </label>

                      <div className="field-wrap">
                        <span>状态</span>
                        <div className="flex h-[44px] items-center rounded-xl border border-white/20 bg-black/15 px-2 text-xs text-slate-200">
                          {compareId === a.id ? "比对账户" : "普通账户"}
                        </div>
                      </div>
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

                    <div className="mt-3 space-y-2">
                      {outgoing.map((t, idx) => {
                        const transferKey = `${t.fromId}-${t.toId}-${t.amount}`;
                        const busy = runningTransfer === transferKey;
                        return (
                          <div
                            key={`${transferKey}-${idx}`}
                            className="flex flex-col gap-2 rounded-xl border border-cyan-200/25 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-50 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <span>
                              需给 {t.to} 转账 {money.format(t.amount)}
                            </span>
                            <button
                              onClick={() => executeTransfer(t)}
                              disabled={busy}
                              className="rounded-lg bg-cyan-200 px-3 py-1.5 text-xs font-medium text-slate-900 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {busy ? "处理中..." : "标记已转账"}
                            </button>
                          </div>
                        );
                      })}

                      {incoming.map((t, idx) => (
                        <div
                          key={`${t.fromId}-${t.toId}-${idx}-in`}
                          className="rounded-xl border border-emerald-200/20 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-50"
                        >
                          预计接收 {t.from} 转入 {money.format(t.amount)}
                        </div>
                      ))}

                      {!outgoing.length && !incoming.length && (
                        <div className="rounded-xl border border-white/15 bg-white/6 px-3 py-2 text-sm text-slate-300">
                          当前账户暂无转账动作。
                        </div>
                      )}
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
