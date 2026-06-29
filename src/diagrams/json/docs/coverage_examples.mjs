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
];
