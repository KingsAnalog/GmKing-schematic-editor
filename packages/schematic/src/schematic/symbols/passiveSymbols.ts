import { line, path, SYMBOL_STROKE_WIDTH } from "./symbolPrimitives";
import {
  variableSymbolArrowHeadSize,
  variableSymbolArrowMarkerSymbol,
  variableSymbolArrowShaftSymbol
} from "./variableSymbolDecoration";

const INDUCTOR_REFERENCE_STROKE_WIDTH = 20;
const INDUCTOR_REFERENCE_CENTER_X = 165;
const INDUCTOR_REFERENCE_START_Y = 0;
const INDUCTOR_REFERENCE_END_Y = 665;
const INDUCTOR_REFERENCE_CENTER_Y = (INDUCTOR_REFERENCE_START_Y + INDUCTOR_REFERENCE_END_Y) / 2;
const INDUCTOR_REFERENCE_BODY_HEIGHT = INDUCTOR_REFERENCE_END_Y - INDUCTOR_REFERENCE_START_Y;
const INDUCTOR_REFERENCE_BODY_WIDTH = 293 - 48;
const INDUCTOR_TAP_JOIN_HALF_THICKNESS = 12;

type ReferencePoint = readonly [number, number];
type ReferenceCurve = readonly [ReferencePoint, ReferencePoint, ReferencePoint];

const INDUCTOR_SPINE_START: ReferencePoint = [165, 0];
const INDUCTOR_SPINE_NECK: ReferencePoint = [165, 137];
const INDUCTOR_SPINE_END: ReferencePoint = [165, 665];

const INDUCTOR_SPINE_CURVES: ReferenceCurve[] = [
  [
    [205, 145],
    [287, 157],
    [293, 194]
  ],
  [
    [298, 216],
    [278, 228],
    [258, 237]
  ],
  [
    [298, 263],
    [298, 308],
    [258, 342]
  ],
  [
    [297, 368],
    [298, 408],
    [258, 449]
  ],
  [
    [298, 474],
    [300, 515],
    [258, 539]
  ],
  [
    [229, 551],
    [195, 556],
    [165, 560]
  ]
];

const INDUCTOR_LOOP_TURNS = [
  { join: [258, 237], left: [48, 199], bottom: [113, 255] },
  { join: [258, 342], left: [48, 311], bottom: [113, 368] },
  { join: [258, 449], left: [49, 416], bottom: [113, 474] }
] as const;

export function resistorSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const { cx, cy, leftPin, rightPin } = twoTerminalGeometry(width, height);
  // Normalize the zigzag body from the reference raster by stroke width; leads remain pin-fitting.
  const referenceCenterX = 168;
  const referenceHalfSpanX = 94;
  const referenceStrokeWidth = 26;
  const referenceBodyTopY = 80;
  const referenceBodyBottomY = 390;
  const referenceBodyCenterY = (referenceBodyTopY + referenceBodyBottomY) / 2;
  const referenceBodyHeight = referenceBodyBottomY - referenceBodyTopY;
  const terminalSpan = rightPin - leftPin;
  const bodyScale = Math.min(lineWidth / referenceStrokeWidth, (height / 2 - 3 * lineWidth) / referenceHalfSpanX, terminalSpan / referenceBodyHeight);
  const round = (value: number) => Math.round(value * 100) / 100;
  const xAtReferenceY = (referenceY: number) => round(cx + (referenceY - referenceBodyCenterY) * bodyScale);
  const yAtReferenceX = (referenceX: number) => round(cy + (referenceX - referenceCenterX) * bodyScale);
  return path([
    line(leftPin, cy, xAtReferenceY(referenceBodyTopY), cy),
    `L ${xAtReferenceY(113)} ${yAtReferenceX(74)}`,
    `L ${xAtReferenceY(163)} ${yAtReferenceX(262)}`,
    `L ${xAtReferenceY(214)} ${yAtReferenceX(74)}`,
    `L ${xAtReferenceY(264)} ${yAtReferenceX(262)}`,
    `L ${xAtReferenceY(314)} ${yAtReferenceX(74)}`,
    `L ${xAtReferenceY(365)} ${yAtReferenceX(262)}`,
    `L ${xAtReferenceY(referenceBodyBottomY)} ${cy}`,
    `L ${rightPin} ${cy}`
  ]);
}

export function variableResistorSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  return path([
    resistorSymbol(width, height, lineWidth),
    variableSymbolArrowShaftSymbol(width, height, lineWidth)
  ]);
}

export function capacitorSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const { cx, cy, leftPin, rightPin } = twoTerminalGeometry(width, height);
  const { leftPlateX, rightPlateX } = capacitorPlateGeometry(cx, lineWidth);
  return path([line(leftPin, cy, leftPlateX, cy), line(rightPlateX, cy, rightPin, cy)]);
}

export function variableCapacitorSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  return path([
    capacitorSymbol(width, height, lineWidth),
    variableSymbolArrowShaftSymbol(width, height, lineWidth)
  ]);
}

export function capacitorPlateSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const cx = width / 2;
  const cy = height / 2;
  const { leftPlateX, rightPlateX, halfPlateLength } = capacitorPlateGeometry(cx, lineWidth);
  return path([line(leftPlateX, cy - halfPlateLength, leftPlateX, cy + halfPlateLength), line(rightPlateX, cy - halfPlateLength, rightPlateX, cy + halfPlateLength)]);
}

export function capacitorPlateStrokeWidth(lineWidth = SYMBOL_STROKE_WIDTH) {
  return 2 * lineWidth;
}

export function variablePassiveArrowMarkerSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  return variableSymbolArrowMarkerSymbol(width, height, lineWidth);
}

export function variablePassiveArrowHeadSize(lineWidth = SYMBOL_STROKE_WIDTH) {
  return variableSymbolArrowHeadSize(lineWidth);
}

export function inductorSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const { cx, cy, leftPin, rightPin } = twoTerminalGeometry(width, height);
  const terminalSpan = rightPin - leftPin;
  const scale = Math.min(
    lineWidth / INDUCTOR_REFERENCE_STROKE_WIDTH,
    terminalSpan / INDUCTOR_REFERENCE_BODY_HEIGHT,
    (height - 4 * lineWidth) / INDUCTOR_REFERENCE_BODY_WIDTH
  );
  const point = (reference: ReferencePoint) => {
    const mapped = referencePointToSymbol(reference, cx, cy, scale);
    return { x: round(2 * cx - mapped.x), y: round(2 * cy - mapped.y) };
  };
  const spineStart = point(INDUCTOR_SPINE_START);
  const spineNeck = point(INDUCTOR_SPINE_NECK);
  const spineEnd = point(INDUCTOR_SPINE_END);
  const spine = [
    line(rightPin, cy, spineStart.x, spineStart.y),
    `L ${spineNeck.x} ${spineNeck.y}`,
    ...INDUCTOR_SPINE_CURVES.map((curve) => referenceCurveToSymbol(curve, point)),
    `L ${spineEnd.x} ${spineEnd.y}`,
    `L ${leftPin} ${cy}`
  ];
  const loops = INDUCTOR_LOOP_TURNS.map((turn) => inductorLoopTurn(turn.join, turn.left, turn.bottom, point));

  return path([...spine, ...loops]);
}

export function inductorCenterTapSymbol(
  width: number,
  height: number,
  side: "top" | "bottom"
) {
  const cx = width / 2;
  const cy = height / 2;
  const pinY = side === "top" ? cy - 20 : cy + 20;
  const joinY = cy + (side === "top" ? -INDUCTOR_TAP_JOIN_HALF_THICKNESS : INDUCTOR_TAP_JOIN_HALF_THICKNESS);
  return path([line(cx, joinY, cx, pinY)]);
}

export function inductorDotMarkerSymbol(
  width: number,
  height: number,
  terminal: "p" | "n",
  lineWidth = SYMBOL_STROKE_WIDTH
) {
  const cx = width / 2;
  const cy = height / 2;
  const x = terminal === "p" ? cx - 30 : cx + 30;
  const y = cy - 13;
  const radius = 2 * lineWidth;
  return [
    `M ${x - radius} ${y}`,
    `A ${radius} ${radius} 0 1 0 ${x + radius} ${y}`,
    `A ${radius} ${radius} 0 1 0 ${x - radius} ${y}`,
    "Z"
  ].join(" ");
}

function inductorLoopTurn(
  joinReference: ReferencePoint,
  leftReference: ReferencePoint,
  bottomReference: ReferencePoint,
  point: (reference: ReferencePoint) => { x: number; y: number }
) {
  const [joinX, joinY] = joinReference;
  const [leftX, leftY] = leftReference;
  const [bottomX, bottomY] = bottomReference;
  const join = point(joinReference);
  return path([
    `M ${join.x} ${join.y}`,
    referenceCurveToSymbol(
      [
        [210, joinY - 30],
        [92, leftY - 22],
        [leftX, leftY]
      ],
      point
    ),
    referenceCurveToSymbol(
      [
        [8, leftY + 24],
        [39, bottomY],
        [bottomX, bottomY]
      ],
      point
    ),
    referenceCurveToSymbol(
      [
        [178, bottomY + 1],
        [225, joinY + 15],
        [joinX, joinY]
      ],
      point
    )
  ]);
}

function referencePointToSymbol([referenceX, referenceY]: ReferencePoint, cx: number, cy: number, scale: number) {
  return {
    x: round(cx + (referenceY - INDUCTOR_REFERENCE_CENTER_Y) * scale),
    y: round(cy + (referenceX - INDUCTOR_REFERENCE_CENTER_X) * scale)
  };
}

function referenceCurveToSymbol(curve: ReferenceCurve, point: (reference: ReferencePoint) => { x: number; y: number }) {
  const [control1, control2, end] = curve.map(point);
  return `C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${end.x} ${end.y}`;
}

function round(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function twoTerminalGeometry(width: number, height: number) {
  const cx = width / 2;
  const cy = height / 2;
  return { cx, cy, leftPin: cx - 40, rightPin: cx + 40 };
}

function capacitorPlateGeometry(cx: number, lineWidth: number) {
  const plateStrokeWidth = capacitorPlateStrokeWidth(lineWidth);
  const plateClearGap = 3 * lineWidth;
  const plateCenterHalfDistance = (plateClearGap + plateStrokeWidth) / 2;
  const halfPlateLength = (12.5 * lineWidth) / 2;
  return {
    leftPlateX: cx - plateCenterHalfDistance,
    rightPlateX: cx + plateCenterHalfDistance,
    halfPlateLength
  };
}
