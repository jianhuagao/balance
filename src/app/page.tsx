"use client";
import { useState, useEffect, useMemo } from "react";
import { init, i, id, tx } from "@instantdb/react";
import { motion, AnimatePresence } from "framer-motion";

const inputClassNames =
  "rounded-lg border border-black/5 bg-white/40 px-3 py-1.5 text-sm/6 backdrop-blur-2xl focus:border-black/5 focus:ring-2 focus:ring-gray-50/50 focus:outline-hidden dark:text-white dark:placeholder:text-white/80 focus:dark:ring-white/50";

// 定义 InstantDB schema
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

export default function ReconcilePage() {
  const [temp, setTemp] = useState<{
    name: string;
    software: number;
    actual: number;
  }>({ name: "", software: 0, actual: 0 });
  const [balanceId, setBalanceId] = useState<string>("");
  const [results, setResults] = useState<string[]>([]);
  const [open, setOpen] = useState<boolean>(false);

  // 查询远程数据，自动侦听
  const { data } = db.useQuery({ accounts: {} });
  const accounts: Account[] = useMemo(() => data?.accounts || [], [data]);

  // 首次加载，默认选中最后添加的账户
  useEffect(() => {
    if (accounts.length && !balanceId) {
      setBalanceId(accounts[accounts.length - 1].id);
    }
  }, [accounts, balanceId]);

  const handleAdd = async () => {
    if (!temp.name.trim()) return;
    const newId = id();
    await db.transact([
      tx.accounts[newId].update({
        name: temp.name,
        software: temp.software,
        actual: temp.actual,
        createdAt: Date.now(),
      }),
    ]);
    setBalanceId(newId);
    setTemp({ name: "", software: 0, actual: 0 });
  };

  const handleDelete = async (delId: string) => {
    if (balanceId === delId) setBalanceId("");
    await db.transact([tx.accounts[delId].delete()]);
  };

  const handleUpdate = async (
    id: string,
    key: "software" | "actual",
    value: number
  ) => {
    await db.transact([tx.accounts[id].update({ [key]: value })]);
  };

  const reconcile = () => {
    const diffs = accounts.map((a) => ({
      ...a,
      diff: +(a.software - a.actual).toFixed(2),
    }));
    const balance = accounts.find((a) => a.id === balanceId);
    if (!balance) return;
    const instructions: string[] = [];

    diffs.forEach((d) => {
      if (d.id === balance.id) return;
      if (d.diff > 0) {
        instructions.push(
          `${d.name} 转账 ${d.diff.toFixed(2)} 元 给 ${balance.name}`
        );
      } else if (d.diff < 0) {
        instructions.push(
          `${balance.name} 转账 ${Math.abs(d.diff).toFixed(2)} 元 给 ${d.name}`
        );
      }
    });

    const total = diffs.reduce((acc, d) => acc + d.diff, 0);
    if (total > 0) {
      instructions.push(`${balance.name} 账户平账支出 ${total.toFixed(2)} 元`);
    } else if (total < 0) {
      instructions.push(
        `${balance.name} 账户平账收入 ${Math.abs(total).toFixed(2)} 元`
      );
    } else {
      instructions.push("无需平账，所有账户已对齐");
    }

    setResults(instructions);
  };

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold">账户平账工具</h1>
      <button
        onClick={() => {
          setOpen(true);
        }}
        className="group relative inline-flex cursor-pointer items-center justify-center rounded-xl bg-white/60 px-4 py-2 text-sm text-cyan-800 ring-1 shadow-black/10 ring-gray-300/50 backdrop-blur-md transition-all duration-300 hover:shadow-lg dark:bg-[rgba(255,255,255,0.15)] dark:text-white dark:shadow dark:shadow-white/10 dark:ring-white/20 dark:hover:ring-white/50"
      >
        <span className="relative z-10">添加账户</span>
        <span className="pointer-events-none absolute right-2 bottom-2 z-0 size-5 rounded-full bg-cyan-400/50 blur-[6px] transition-transform duration-300 ease-in-out group-hover:translate-1/2 dark:bg-cyan-400/40"></span>
      </button>
      {/* 账户列表，可编辑金额 */}
      <div>
        <AnimatePresence>
          {accounts.map((a) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: "auto", marginBottom: 10 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ type: "spring" }}
              className="flex items-center gap-2"
            >
              <div className="relative">
                <input
                  value={a.name}
                  disabled
                  id="input1"
                  type="text"
                  aria-label="inputtext"
                  name="inputtext"
                  className="peer rounded-lg border border-black/5 bg-white/40 px-3 pt-5 pb-2 text-sm/6 backdrop-blur-2xl focus:border-black/5 focus:ring-2 focus:ring-gray-50/50 focus:outline-hidden dark:text-white dark:placeholder:text-white/80 focus:dark:ring-white/50"
                  placeholder=""
                />
                <label
                  htmlFor="input1"
                  className="absolute top-1/2 left-3 origin-[0] -translate-y-5 scale-[.70] cursor-text text-sm opacity-50 transition-transform peer-placeholder-shown:translate-x-0 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-placeholder-shown:opacity-80 peer-focus:-translate-y-5 peer-focus:scale-[.70] peer-focus:opacity-50 dark:text-white"
                >
                  账户名称
                </label>
              </div>
              <div className="relative">
                <input
                  id="input2"
                  type="number"
                  aria-label="inputtext"
                  name="inputtext"
                  className="peer rounded-lg border border-black/5 bg-white/40 px-3 pt-5 pb-2 text-sm/6 backdrop-blur-2xl focus:border-black/5 focus:ring-2 focus:ring-gray-50/50 focus:outline-hidden dark:text-white dark:placeholder:text-white/80 focus:dark:ring-white/50"
                  placeholder=""
                  defaultValue={a.software}
                  onBlur={(e) =>
                    handleUpdate(
                      a.id,
                      "software",
                      parseFloat(e.target.value) || 0
                    )
                  }
                />
                <label
                  htmlFor="input2"
                  className="absolute top-1/2 left-3 origin-[0] -translate-y-5 scale-[.70] cursor-text text-sm opacity-50 transition-transform peer-placeholder-shown:translate-x-0 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-placeholder-shown:opacity-80 peer-focus:-translate-y-5 peer-focus:scale-[.70] peer-focus:opacity-50 dark:text-white"
                >
                  软件余额
                </label>
              </div>

              <div className="relative">
                <input
                  id="input3"
                  type="number"
                  aria-label="inputtext"
                  name="inputtext"
                  className="peer rounded-lg border border-black/5 bg-white/40 px-3 pt-5 pb-2 text-sm/6 backdrop-blur-2xl focus:border-black/5 focus:ring-2 focus:ring-gray-50/50 focus:outline-hidden dark:text-white dark:placeholder:text-white/80 focus:dark:ring-white/50"
                  placeholder=""
                  defaultValue={a.actual}
                  onBlur={(e) =>
                    handleUpdate(
                      a.id,
                      "actual",
                      parseFloat(e.target.value) || 0
                    )
                  }
                />
                <label
                  htmlFor="input3"
                  className="absolute top-1/2 left-3 origin-[0] -translate-y-5 scale-[.70] cursor-text text-sm opacity-50 transition-transform peer-placeholder-shown:translate-x-0 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-placeholder-shown:opacity-80 peer-focus:-translate-y-5 peer-focus:scale-[.70] peer-focus:opacity-50 dark:text-white"
                >
                  实际余额
                </label>
              </div>

              <button
                onClick={() => handleDelete(a.id)}
                className="group relative inline-flex cursor-pointer items-center justify-center rounded-xl bg-white/60 px-4 py-2 text-sm text-red-800 ring-1 shadow-black/10 ring-gray-300/50 backdrop-blur-md transition-all duration-300 hover:shadow-lg dark:bg-[rgba(255,255,255,0.15)] dark:text-white dark:shadow dark:shadow-white/10 dark:ring-white/20 dark:hover:ring-white/50"
              >
                <span className="relative z-10">&emsp;删除&emsp;</span>
                <span className="pointer-events-none absolute right-2 bottom-2 z-0 size-5 rounded-full bg-red-400/50 blur-[6px] transition-transform duration-300 ease-in-out group-hover:translate-1/2 dark:bg-red-400/40"></span>
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* 选择平账账户 */}
      {accounts.length > 0 && (
        <div className="space-y-5">
          <select
            className="w-full rounded border border-gray-300 px-3 py-2"
            value={balanceId}
            onChange={(e) => setBalanceId(e.target.value)}
          >
            <option value="">请选择平账账户</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <button
            onClick={reconcile}
            className="group relative inline-flex cursor-pointer items-center justify-center rounded-xl bg-white/60 px-4 py-2 text-sm text-emerald-800 ring-1 shadow-black/10 ring-gray-300/50 backdrop-blur-md transition-all duration-300 hover:shadow-lg dark:bg-[rgba(255,255,255,0.15)] dark:text-white dark:shadow dark:shadow-white/10 dark:ring-white/20 dark:hover:ring-white/50"
          >
            <span className="relative z-10">进行平账</span>
            <span className="pointer-events-none absolute right-2 bottom-2 z-0 size-5 rounded-full bg-emerald-400/50 blur-[6px] transition-transform duration-300 ease-in-out group-hover:translate-1/2 dark:bg-emerald-400/40"></span>
          </button>
        </div>
      )}

      {/* 平账结果 */}
      {results.length > 0 && (
        <div className="group animate-border rounded-lg bg-gradient-to-r from-pink-400 via-sky-400 to-yellow-400 bg-[length:_400%_400%] p-[3px] text-slate-900 [animation-duration:_10s]">
          <div className="grid gap-y-1 rounded-md bg-slate-100/90 p-3 transition-all group-hover:bg-slate-100/95">
            <div className="p-4 bg-white text-gray-900 rounded shadow">
              <h2 className="font-bold mb-2">平账结果</h2>
              {results.map((r, i) => (
                <p key={i} className="text-sm mt-1">
                  {r}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-content-center bg-black/50 p-4 backdrop-blur-lg"
          role="dialog"
          aria-modal="true"
          aria-labelledby="addAcc"
        >
          <div className="w-full max-w-md rounded-3xl border border-transparent bg-white p-6 shadow-lg dark:border-white/20 dark:bg-black dark:text-white">
            <div className="flex items-start justify-between">
              <h2
                id="addAcc"
                className="text-xl font-bold text-gray-900 sm:text-2xl dark:text-white"
              >
                添加账户
              </h2>

              <button
                onClick={() => {
                  setOpen(false);
                }}
                type="button"
                className="-me-4 -mt-4 cursor-pointer rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600 focus:outline-none dark:hover:bg-white/20 dark:hover:text-white"
                aria-label="Close"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="size-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="mt-4 text-pretty text-gray-700 dark:text-white/70">
              <div className="my-2 min-w-[388px]">
                {/* 添加新账户 */}
                <div className="flex flex-col gap-2">
                  <p>账户名</p>
                  <input
                    className={inputClassNames}
                    placeholder="账户名"
                    value={temp.name}
                    onChange={(e) => setTemp({ ...temp, name: e.target.value })}
                  />
                  <p>软件余额</p>
                  <input
                    className={inputClassNames}
                    placeholder="软件余额"
                    type="number"
                    value={temp.software}
                    onChange={(e) =>
                      setTemp({
                        ...temp,
                        software: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                  <p>实际余额</p>
                  <input
                    className={inputClassNames}
                    placeholder="实际余额"
                    type="number"
                    value={temp.actual}
                    onChange={(e) =>
                      setTemp({
                        ...temp,
                        actual: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>
            </div>

            <footer className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => {
                  setOpen(false);
                }}
                className="group relative inline-flex cursor-pointer items-center justify-center rounded-xl bg-white/60 px-4 py-2 text-sm text-yellow-800 ring-1 shadow-black/10 ring-gray-300/50 backdrop-blur-md transition-all duration-300 hover:shadow-lg dark:bg-[rgba(255,255,255,0.15)] dark:text-white dark:shadow dark:shadow-white/10 dark:ring-white/20 dark:hover:ring-white/50"
              >
                <span className="relative z-10">取消</span>
                <span className="pointer-events-none absolute right-2 bottom-2 z-0 size-5 rounded-full bg-yellow-300/50 blur-[6px] transition-transform duration-300 ease-in-out group-hover:translate-1/2 dark:bg-yellow-300/30"></span>
              </button>

              <button
                onClick={handleAdd}
                className="group relative inline-flex cursor-pointer items-center justify-center rounded-xl bg-white/60 px-4 py-2 text-sm text-purple-800 ring-1 shadow-black/10 ring-gray-300/50 backdrop-blur-md transition-all duration-300 hover:shadow-lg dark:bg-[rgba(255,255,255,0.15)] dark:text-white dark:shadow dark:shadow-white/10 dark:ring-white/20 dark:hover:ring-white/50"
              >
                <span className="relative z-10">添加账户</span>
                <span className="pointer-events-none absolute right-2 bottom-2 z-0 size-5 rounded-full bg-purple-400/50 blur-[6px] transition-transform duration-300 ease-in-out group-hover:translate-1/2 dark:bg-purple-400/40"></span>
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
