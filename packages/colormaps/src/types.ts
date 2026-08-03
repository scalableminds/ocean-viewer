/**
 * One stop of a piecewise-linear colormap: the position along the colormap in
 * `[0, 1]`, followed by the 8-bit sRGB channels at that position.
 *
 * Colours between two stops are linearly interpolated, so a colormap is fully
 * described by its stop list. Every colormap starts at position `0` and ends at
 * position `1`.
 */
export type ColormapStop = [
	position: number,
	red: number,
	green: number,
	blue: number,
];
