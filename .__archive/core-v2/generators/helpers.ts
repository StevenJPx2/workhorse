import type { NodePlopAPI } from "plop";

export function registerHelpers(plop: NodePlopAPI): void {
  /** UPPER_SNAKE_CASE — for constants and diagnostic codes. */
  plop.addHelper("upperSnakeCase", (text: string) =>
    (plop.getHelper("snakeCase")(text) as string).toUpperCase(),
  );

  /** Title Case — for human-readable labels. */
  plop.addHelper("titleCase", (text: string) =>
    (plop.getHelper("snakeCase")(text) as string)
      .split("_")
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" "),
  );

  /** PascalCase — for class names. */
  plop.addHelper("pascalCase", (text: string) =>
    (plop.getHelper("kebabCase")(text) as string)
      .split("-")
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(""),
  );

  /** camelCase — for function/variable names. */
  plop.addHelper("camelCase", (text: string) => {
    const kebab = (plop.getHelper("kebabCase")(text) as string).split("-");
    return (
      kebab[0] +
      kebab
        .slice(1)
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
        .join("")
    );
  });
}
