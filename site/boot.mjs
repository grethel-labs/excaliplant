// Runs before the first paint: applies the colour theme the visitor chose, so
// the page does not flash light when they prefer dark.
try {
  const saved = localStorage.getItem("excaliplant.theme");
  if (saved === "light" || saved === "dark") document.documentElement.dataset.theme = saved;
} catch {
  // storage unavailable: follow the system
}
