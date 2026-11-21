// Node module hooks that resolve the bare `obsidian` import to the mock.
// Registered from obsidian.test.mjs with `module.register`.

const MOCK = new URL("./obsidian_mock.mjs", import.meta.url).href;

export async function resolve(specifier, context, next) {
  if (specifier === "obsidian") return { url: MOCK, shortCircuit: true };
  return next(specifier, context);
}
