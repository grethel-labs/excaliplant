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
];
