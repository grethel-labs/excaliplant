/**
 * Bundled replacements for popular PlantUML standard-library includes.
 *
 * These are excaliplant's own lightweight implementations (not copies of the
 * upstream libraries): they define the public procedures of the C4 model
 * library on top of plain component-diagram syntax so `!include <C4/…>`
 * diagrams render without network or file-system access.
 * @module core/preprocess/stdlib
 */

const C4_CORE = String.raw`
!$C4_PERSON = "08427b"
!$C4_PERSON_EXT = "686868"
!$C4_SYSTEM = "1168bd"
!$C4_SYSTEM_EXT = "999999"
!$C4_CONTAINER = "438dd5"
!$C4_CONTAINER_EXT = "b3b3b3"
!$C4_COMPONENT = "85bbf0"
!$C4_COMPONENT_EXT = "cccccc"
!$C4_SHOW_LEGEND = 0

!function $c4Label($label, $kind, $techn, $descr)
!$t = "<b>" + $label + "</b>"
!if $techn != ""
!$t = $t + "\n<size:11>[" + $kind + ": " + $techn + "]</size>"
!else
!$t = $t + "\n<size:11>[" + $kind + "]</size>"
!endif
!if $descr != ""
!$t = $t + "\n\n<size:12>" + $descr + "</size>"
!endif
!return $t
!endfunction

!procedure $c4Element($shape, $alias, $label, $kind, $techn, $descr, $color, $text)
$shape "$c4Label($label, $kind, $techn, $descr)" <<c4>> as $alias #$color;line:$color;text:$text
!endprocedure

!unquoted procedure Person($alias, $label="", $descr="", $sprite="", $tags="", $link="", $type="")
$c4Element("person", $alias, $label, "Person", "", $descr, $C4_PERSON, "white")
!endprocedure
!unquoted procedure Person_Ext($alias, $label="", $descr="", $sprite="", $tags="", $link="", $type="")
$c4Element("person", $alias, $label, "External Person", "", $descr, $C4_PERSON_EXT, "white")
!endprocedure
!unquoted procedure System($alias, $label="", $descr="", $sprite="", $tags="", $link="", $type="", $baseShape="")
$c4Element("rectangle", $alias, $label, "Software System", "", $descr, $C4_SYSTEM, "white")
!endprocedure
!unquoted procedure System_Ext($alias, $label="", $descr="", $sprite="", $tags="", $link="", $type="", $baseShape="")
$c4Element("rectangle", $alias, $label, "External System", "", $descr, $C4_SYSTEM_EXT, "white")
!endprocedure
!unquoted procedure SystemDb($alias, $label="", $descr="", $sprite="", $tags="", $link="", $type="")
$c4Element("database", $alias, $label, "Software System", "", $descr, $C4_SYSTEM, "white")
!endprocedure
!unquoted procedure SystemDb_Ext($alias, $label="", $descr="", $sprite="", $tags="", $link="", $type="")
$c4Element("database", $alias, $label, "External System", "", $descr, $C4_SYSTEM_EXT, "white")
!endprocedure
!unquoted procedure SystemQueue($alias, $label="", $descr="", $sprite="", $tags="", $link="", $type="")
$c4Element("queue", $alias, $label, "Software System", "", $descr, $C4_SYSTEM, "white")
!endprocedure
!unquoted procedure SystemQueue_Ext($alias, $label="", $descr="", $sprite="", $tags="", $link="", $type="")
$c4Element("queue", $alias, $label, "External System", "", $descr, $C4_SYSTEM_EXT, "white")
!endprocedure
!unquoted procedure Container($alias, $label="", $techn="", $descr="", $sprite="", $tags="", $link="", $baseShape="")
$c4Element("rectangle", $alias, $label, "Container", $techn, $descr, $C4_CONTAINER, "white")
!endprocedure
!unquoted procedure Container_Ext($alias, $label="", $techn="", $descr="", $sprite="", $tags="", $link="", $baseShape="")
$c4Element("rectangle", $alias, $label, "External Container", $techn, $descr, $C4_CONTAINER_EXT, "black")
!endprocedure
!unquoted procedure ContainerDb($alias, $label="", $techn="", $descr="", $sprite="", $tags="", $link="")
$c4Element("database", $alias, $label, "Container", $techn, $descr, $C4_CONTAINER, "white")
!endprocedure
!unquoted procedure ContainerDb_Ext($alias, $label="", $techn="", $descr="", $sprite="", $tags="", $link="")
$c4Element("database", $alias, $label, "External Container", $techn, $descr, $C4_CONTAINER_EXT, "black")
!endprocedure
!unquoted procedure ContainerQueue($alias, $label="", $techn="", $descr="", $sprite="", $tags="", $link="")
$c4Element("queue", $alias, $label, "Container", $techn, $descr, $C4_CONTAINER, "white")
!endprocedure
!unquoted procedure ContainerQueue_Ext($alias, $label="", $techn="", $descr="", $sprite="", $tags="", $link="")
$c4Element("queue", $alias, $label, "External Container", $techn, $descr, $C4_CONTAINER_EXT, "black")
!endprocedure
!unquoted procedure Component($alias, $label="", $techn="", $descr="", $sprite="", $tags="", $link="", $baseShape="")
$c4Element("rectangle", $alias, $label, "Component", $techn, $descr, $C4_COMPONENT, "black")
!endprocedure
!unquoted procedure Component_Ext($alias, $label="", $techn="", $descr="", $sprite="", $tags="", $link="", $baseShape="")
$c4Element("rectangle", $alias, $label, "External Component", $techn, $descr, $C4_COMPONENT_EXT, "black")
!endprocedure
!unquoted procedure ComponentDb($alias, $label="", $techn="", $descr="", $sprite="", $tags="", $link="")
$c4Element("database", $alias, $label, "Component", $techn, $descr, $C4_COMPONENT, "black")
!endprocedure
!unquoted procedure ComponentQueue($alias, $label="", $techn="", $descr="", $sprite="", $tags="", $link="")
$c4Element("queue", $alias, $label, "Component", $techn, $descr, $C4_COMPONENT, "black")
!endprocedure

!unquoted procedure Boundary($alias, $label="", $type="", $tags="", $link="")
rectangle "<b>$label</b>\n<size:11>[$type]</size>" <<c4boundary>> as $alias ##[dashed]444444
!endprocedure
!unquoted procedure Enterprise_Boundary($alias, $label="", $tags="", $link="")
Boundary($alias, $label, "Enterprise")
!endprocedure
!unquoted procedure System_Boundary($alias, $label="", $tags="", $link="")
Boundary($alias, $label, "System")
!endprocedure
!unquoted procedure Container_Boundary($alias, $label="", $tags="", $link="")
Boundary($alias, $label, "Container")
!endprocedure

!function $c4RelLabel($label, $techn)
!if $techn != ""
!return $label + "\n<size:10>[" + $techn + "]</size>"
!endif
!return $label
!endfunction

!unquoted procedure Rel($from, $to, $label="", $techn="", $descr="", $sprite="", $tags="", $link="")
$from --> $to : "$c4RelLabel($label, $techn)"
!endprocedure
!unquoted procedure BiRel($from, $to, $label="", $techn="", $descr="", $sprite="", $tags="", $link="")
$from <--> $to : "$c4RelLabel($label, $techn)"
!endprocedure
!unquoted procedure Rel_Back($from, $to, $label="", $techn="", $descr="", $sprite="", $tags="", $link="")
$to --> $from : "$c4RelLabel($label, $techn)"
!endprocedure
!unquoted procedure Rel_Neighbor($from, $to, $label="", $techn="", $descr="", $sprite="", $tags="", $link="")
$from -> $to : "$c4RelLabel($label, $techn)"
!endprocedure
!unquoted procedure Rel_U($from, $to, $label="", $techn="", $descr="", $sprite="", $tags="", $link="")
$from -up-> $to : "$c4RelLabel($label, $techn)"
!endprocedure
!unquoted procedure Rel_Up($from, $to, $label="", $techn="", $descr="", $sprite="", $tags="", $link="")
$from -up-> $to : "$c4RelLabel($label, $techn)"
!endprocedure
!unquoted procedure Rel_D($from, $to, $label="", $techn="", $descr="", $sprite="", $tags="", $link="")
$from -down-> $to : "$c4RelLabel($label, $techn)"
!endprocedure
!unquoted procedure Rel_Down($from, $to, $label="", $techn="", $descr="", $sprite="", $tags="", $link="")
$from -down-> $to : "$c4RelLabel($label, $techn)"
!endprocedure
!unquoted procedure Rel_L($from, $to, $label="", $techn="", $descr="", $sprite="", $tags="", $link="")
$from -left-> $to : "$c4RelLabel($label, $techn)"
!endprocedure
!unquoted procedure Rel_Left($from, $to, $label="", $techn="", $descr="", $sprite="", $tags="", $link="")
$from -left-> $to : "$c4RelLabel($label, $techn)"
!endprocedure
!unquoted procedure Rel_R($from, $to, $label="", $techn="", $descr="", $sprite="", $tags="", $link="")
$from -right-> $to : "$c4RelLabel($label, $techn)"
!endprocedure
!unquoted procedure Rel_Right($from, $to, $label="", $techn="", $descr="", $sprite="", $tags="", $link="")
$from -right-> $to : "$c4RelLabel($label, $techn)"
!endprocedure
!unquoted procedure Lay_U($from, $to)
$from -[hidden]up- $to
!endprocedure
!unquoted procedure Lay_D($from, $to)
$from -[hidden]down- $to
!endprocedure
!unquoted procedure Lay_L($from, $to)
$from -[hidden]left- $to
!endprocedure
!unquoted procedure Lay_R($from, $to)
$from -[hidden]right- $to
!endprocedure
!unquoted procedure Lay_Distance($from, $to, $distance=0)
$from -[hidden]down- $to
!endprocedure

!unquoted procedure LAYOUT_TOP_DOWN()
top to bottom direction
!endprocedure
!unquoted procedure LAYOUT_LEFT_RIGHT()
left to right direction
!endprocedure
!unquoted procedure LAYOUT_LANDSCAPE()
left to right direction
!endprocedure
!unquoted procedure LAYOUT_WITH_LEGEND()
!$C4_SHOW_LEGEND = 1
!endprocedure
!unquoted procedure LAYOUT_AS_SKETCH()
!endprocedure
!unquoted procedure HIDE_STEREOTYPE()
!endprocedure
!unquoted procedure SHOW_PERSON_OUTLINE()
!endprocedure
!unquoted procedure SHOW_LEGEND($hideStereotype="", $details="")
legend right
<b>Legend</b>
<color:#08427b>■</color> person
<color:#1168bd>■</color> system
<color:#438dd5>■</color> container
<color:#85bbf0>■</color> component
<color:#999999>■</color> external
endlegend
!endprocedure
!unquoted procedure SHOW_FLOATING_LEGEND($alias="", $hideStereotype="", $details="")
SHOW_LEGEND()
!endprocedure
!unquoted procedure AddElementTag($tagStereo, $bgColor="", $fontColor="", $borderColor="", $shadowing="", $shape="", $sprite="", $techn="", $legendText="", $legendSprite="", $borderStyle="", $borderThickness="")
!endprocedure
!unquoted procedure AddRelTag($tagStereo, $textColor="", $lineColor="", $lineStyle="", $sprite="", $techn="", $legendText="", $legendSprite="", $lineThickness="")
!endprocedure
!unquoted procedure UpdateElementStyle($elementName, $bgColor="", $fontColor="", $borderColor="", $shadowing="", $shape="", $sprite="", $legendText="", $legendSprite="", $borderStyle="", $borderThickness="")
!endprocedure
!unquoted procedure UpdateRelStyle($textColor, $lineColor)
!endprocedure
!unquoted procedure UpdateBoundaryStyle($elementName="", $bgColor="", $fontColor="", $borderColor="", $shadowing="", $shape="", $type="", $legendText="", $borderStyle="", $borderThickness="")
!endprocedure
`;

/** ArchiMate element types per layer (subset of the ArchiMate 3 vocabulary). */
const ARCHIMATE_TYPES = {
  Business: [
    "Actor",
    "Role",
    "Collaboration",
    "Interface",
    "Process",
    "Function",
    "Interaction",
    "Event",
    "Service",
    "Object",
    "Contract",
    "Representation",
    "Product",
  ],
  Application: [
    "Component",
    "Collaboration",
    "Interface",
    "Function",
    "Interaction",
    "Process",
    "Event",
    "Service",
    "DataObject",
  ],
  Technology: [
    "Node",
    "Device",
    "SystemSoftware",
    "Collaboration",
    "Interface",
    "Path",
    "CommunicationNetwork",
    "Function",
    "Process",
    "Interaction",
    "Event",
    "Service",
    "Artifact",
  ],
  Physical: ["Equipment", "Facility", "DistributionNetwork", "Material"],
  Motivation: [
    "Stakeholder",
    "Driver",
    "Assessment",
    "Goal",
    "Outcome",
    "Principle",
    "Requirement",
    "Constraint",
    "Meaning",
    "Value",
  ],
  Strategy: ["Resource", "Capability", "CourseOfAction", "ValueStream"],
  Implementation: ["WorkPackage", "Deliverable", "Event", "Plateau", "Gap"],
};

/** Relationship macro → link arrow. */
const ARCHIMATE_RELS = {
  Composition: ["*-", "-"],
  Aggregation: ["o-", "-"],
  Assignment: ["0-", "->"],
  Realization: [".", ".|>"],
  Serving: ["-", "->>"],
  Access: [".", ".>"],
  Influence: [".", ".>"],
  Triggering: ["-", "->"],
  Flow: [".", ".>"],
  Specialization: ["-", "-|>"],
  Association: ["-", "-"],
};

/** @param {string} s */
const kebab = (s) => s.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();

function archimateLibrary() {
  const lines = [];
  for (const [layer, types] of Object.entries(ARCHIMATE_TYPES)) {
    for (const type of types) {
      lines.push(`!unquoted procedure ${layer}_${type}($id, $label="", $stereo="")`);
      lines.push(`archimate #${layer} "$label" as $id <<${layer.toLowerCase()}-${kebab(type)}>>`);
      lines.push("!endprocedure");
    }
  }
  for (const [name, [head, tail]] of Object.entries(ARCHIMATE_RELS)) {
    for (const [suffix, dir] of [
      ["", ""],
      ["_Up", "up"],
      ["_Down", "down"],
      ["_Left", "left"],
      ["_Right", "right"],
    ]) {
      lines.push(`!unquoted procedure Rel_${name}${suffix}($from, $to, $label="")`);
      lines.push(`$from ${head}${dir}${tail} $to : $label`);
      lines.push("!endprocedure");
    }
  }
  lines.push(
    '!unquoted procedure Junction_And($id, $label="")',
    'archimate #black "" as $id <<junction>>',
    "!endprocedure",
  );
  lines.push(
    '!unquoted procedure Junction_Or($id, $label="")',
    'archimate #white "" as $id <<or-junction>>',
    "!endprocedure",
  );
  lines.push(
    '!unquoted procedure Grouping($id, $label="")',
    'rectangle "$label" as $id ##[dashed]',
    "!endprocedure",
  );
  lines.push(
    '!unquoted procedure Group($id, $label="")',
    'rectangle "$label" as $id ##[dashed]',
    "!endprocedure",
  );
  return lines.join("\n");
}

const ARCHIMATE = archimateLibrary();

/**
 * Bundled stdlib sources keyed by include name (without angle brackets).
 * @type {ReadonlyMap<string, string>}
 */
export const STDLIB = new Map([
  ["C4/C4", C4_CORE],
  ["C4/C4_Context", C4_CORE],
  ["C4/C4_Container", C4_CORE],
  ["C4/C4_Component", C4_CORE],
  ["C4/C4_Deployment", C4_CORE],
  ["C4/C4_Dynamic", C4_CORE],
  ["C4_Context", C4_CORE],
  ["C4_Container", C4_CORE],
  ["C4_Component", C4_CORE],
  ["archimate/Archimate", ARCHIMATE],
  ["Archimate", ARCHIMATE],
]);
