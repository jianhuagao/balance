import { memo } from "react";

export default memo(function Input() {
  return (
    <input
      type="text"
      aria-label="inputtext"
      name="inputtext"
      className="w-64 rounded-lg border border-black/5 bg-white/40 px-3 py-1.5 text-sm/6 backdrop-blur-2xl focus:border-black/5 focus:ring-2 focus:ring-gray-50/50 focus:outline-hidden dark:text-white dark:placeholder:text-white/80 focus:dark:ring-white/50"
      placeholder="First Name"
      value=""
    />
  );
});
