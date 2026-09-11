// Empty on purpose. Tailwind v4 is loaded through the Vite plugin, not
// PostCSS. Without this file Vite walks up the tree and finds the parent
// MedSync application's PostCSS config, whose plugins are not installed here.
export default { plugins: {} };
