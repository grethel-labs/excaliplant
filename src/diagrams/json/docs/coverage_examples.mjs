/** @module diagrams/json/docs/coverage_examples */
/** @public */
export const jsonCoverageExamples = [
  {
    name: "object-array",
    source: `@startjson
{
  "fruit": "Apple",
  "size": "Large",
  "color": ["Red", "Green"]
}
@endjson`,
  },
  {
    name: "highlight",
    source: `@startjson
#highlight "address" / "city"
{
  "firstName": "John",
  "lastName": "Smith",
  "address": { "city": "New York" }
}
@endjson`,
  },
  {
    name: "feature-combination",
    title: "Feature combination",
    description:
      "Combines nested objects, arrays, booleans, nulls, long strings and highlight directives.",
    source: `@startjson
#highlight "coverage" / "modules" / 1 / "status"
{
  "repository": "grethel-labs/excaliplant",
  "coverage": {
    "generatedDocs": true,
    "modules": [
      {
        "kind": "sequence",
        "status": "reference quality",
        "examples": ["small", "fragment-heavy", "style-heavy"]
      },
      {
        "kind": "files",
        "status": "repo-derived dynamic example",
        "examples": ["project-tree", "merged-paths", "feature-combination"]
      }
    ],
    "reviewNotes": "Long values exercise wrapping and SVG table sizing decisions.",
    "openRisk": null
  }
}
@endjson`,
  },
];
