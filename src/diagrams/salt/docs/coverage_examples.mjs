/** @module diagrams/salt/docs/coverage_examples */
/** @public */
export const saltCoverageExamples = [
  {
    name: "basic-controls",
    source: `@startsalt
{
  Just plain text
  [This is my button]
  () Unchecked radio
  (X) Checked radio
  [] Unchecked box
  [X] Checked box
  "Enter text here"
  ^This is a droplist^
}
@endsalt`,
  },
  {
    name: "textarea",
    source: `@startsalt
{+
   This is a long
   text in a textarea
   .
   "                         "
}
@endsalt`,
  },
  {
    name: "feature-combination",
    title: "Feature combination",
    description:
      "Combines labels, buttons, radios, checkboxes, inputs, dropdowns, tabs and grid-like rows.",
    source: `@startsalt
{
  /Coverage/
  [Render module gallery]
  [X] Small examples exist
  [X] Large combination examples exist
  [] Manual SVG review pending
  () Draft
  (X) Ready
  "Long free text field that should wrap into a readable rendered node"
  ^release:minor^
  | Module | Examples | SVG |
  | sequence | many | generated |
  | files | repo-derived | generated |
}
@endsalt`,
  },
];
