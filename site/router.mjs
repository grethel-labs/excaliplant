// Hash routing for the two views. Pure: takes the hash, returns a route.
//
//   (empty), #play                 playground
//   #p=<payload>                   playground with a shared document
//   #play/<kind>/<name>            playground with an example opened
//   #gallery, #gallery/<kind>, #gallery/<kind>/<name>   gallery
//   #<kind>, #<kind>/<name>        gallery (links from before the playground existed)

import { KIND_CHOICES } from "./playground/options.mjs";

/**
 * @typedef {{ view: "play", payload?: string, example?: string }
 *   | { view: "gallery", kind?: string, example?: string }} Route
 */

/**
 * @param {string} hash `location.hash`, with or without the leading `#`.
 * @returns {Route}
 */
export function parseRoute(hash) {
  let h = String(hash).replace(/^#/, "");
  if (h.startsWith("p=")) return { view: "play", payload: h.slice(2) };
  try {
    h = decodeURIComponent(h);
  } catch {
    return { view: "play" };
  }
  const [head, ...rest] = h.split("/");
  const id = rest.length >= 2 ? rest.slice(0, 2).join("/") : undefined;
  if (head === "" || head === "play") return id ? { view: "play", example: id } : { view: "play" };
  if (head === "gallery") {
    if (id) return { view: "gallery", example: id };
    return rest[0] ? { view: "gallery", kind: rest[0] } : { view: "gallery" };
  }
  // Old gallery links: #<kind> and #<kind>/<name>.
  if (rest.length >= 1) return { view: "gallery", example: `${head}/${rest[0]}` };
  return KIND_CHOICES.includes(head) ? { view: "gallery", kind: head } : { view: "play" };
}

/**
 * @param {string} id `kind/name`
 * @returns {string}
 */
export const playHash = (id) => `#play/${id}`;

/**
 * @param {string} id `kind/name`
 * @returns {string}
 */
export const galleryHash = (id) => `#gallery/${id}`;
