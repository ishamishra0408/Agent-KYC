// Local-only overrides, loaded when present: src/local/ is git-ignored, so a theme made for one
// machine never reaches the repo or a deploy. main.tsx imports this after styles.css, so the
// overrides win; an eager glob's imports are hoisted to the top of their module, hence a module of
// its own.
import.meta.glob(["./local/*.css", "./local/*.ts"], { eager: true });
