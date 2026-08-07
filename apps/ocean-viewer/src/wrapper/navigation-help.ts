/**
 * An "i" badge in the viewer's top-right corner that reveals a navigation
 * cheat sheet on hover.
 *
 * The Ocean Viewer hides Neuroglancer's top bar and help button, and rebinds
 * the wheel on top of that (see `input-bindings.ts`), so an embedded user has
 * no way to discover how to move around. Neuroglancer's own help panel (`h`)
 * is both undiscoverable in an iframe and far too long.
 *
 * Hover/focus only, in CSS — no click target, no state to keep in sync.
 *
 * {@link SECTIONS} mirrors the bindings by hand: edit it whenever
 * `input-bindings.ts` changes.
 */

import { OVERLAY_ATTRIBUTE } from "./viewport-controls.js";

const ROOT_CLASS = "ocean-navigation-help";

/** A row of the cheat sheet: what it does, and how you do it. */
interface Gesture {
	action: string;
	/** Rendered as `<kbd>` chips joined by "or". */
	inputs: string[];
}

const SECTIONS: ReadonlyArray<{
	title: string;
	gestures: readonly Gesture[];
}> = [
	{
		title: "Map panels",
		gestures: [
			{ action: "Pan", inputs: ["drag", "arrow keys"] },
			{ action: "Zoom", inputs: ["scroll"] },
			{ action: "Move up / down a level", inputs: ["ctrl + scroll", ",", "."] },
			{ action: "Step through time", inputs: ["[", "]"] },
		],
	},
	{
		title: "3D panel",
		gestures: [
			{ action: "Rotate", inputs: ["drag"] },
			{ action: "Pan", inputs: ["shift + drag"] },
			{ action: "Zoom", inputs: ["scroll"] },
			{ action: "Reset the camera", inputs: ["⌂ XY XZ YZ"] },
		],
	},
];

export class NavigationHelp {
	private readonly root: HTMLElement;

	/**
	 * Mounted on the viewer's container rather than inside `viewer.element`, so
	 * a layout change can't tear it down and it never lands in a panel corner
	 * where Neuroglancer — or `viewport-controls.ts` — puts controls of its own.
	 */
	constructor(container: HTMLElement) {
		this.root = build();
		container.appendChild(this.root);
	}

	dispose(): void {
		this.root.remove();
	}
}

function build(): HTMLElement {
	const root = document.createElement("div");
	root.className = ROOT_CLASS;
	root.setAttribute(OVERLAY_ATTRIBUTE, "");

	const trigger = document.createElement("button");
	trigger.type = "button";
	trigger.className = `${ROOT_CLASS}-trigger`;
	trigger.textContent = "i";
	// The popover is hover/focus-driven, so the button itself does nothing —
	// it exists to be focusable, which is what makes the popover keyboard- and
	// touch-reachable.
	trigger.setAttribute("aria-label", "How to navigate");
	root.appendChild(trigger);

	const popover = document.createElement("div");
	popover.className = `${ROOT_CLASS}-popover`;
	popover.setAttribute("role", "tooltip");
	for (const { title, gestures } of SECTIONS) {
		const heading = document.createElement("h2");
		heading.textContent = title;
		popover.appendChild(heading);

		const list = document.createElement("dl");
		for (const { action, inputs } of gestures) {
			const term = document.createElement("dt");
			term.textContent = action;
			list.appendChild(term);

			const detail = document.createElement("dd");
			inputs.forEach((input, index) => {
				if (index > 0) {
					detail.appendChild(document.createTextNode(" or "));
				}
				const key = document.createElement("kbd");
				key.textContent = input;
				detail.appendChild(key);
			});
			list.appendChild(detail);
		}
		popover.appendChild(list);
	}
	root.appendChild(popover);

	return root;
}
