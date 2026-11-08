/**
 * A quiet frame, not a skeleton.
 *
 * The shell already paints its own dark launch screen, so pulsing placeholder
 * blocks here only read as "web page loading". Keeping the screen empty (with
 * the background colour the rest of the app uses) makes navigation look like
 * one native screen replacing another.
 */
export default function AppLoading() {
  return <main aria-busy="true" aria-label="Loading" className="min-h-dvh bg-ink" />;
}
